import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createStaticHandler } from '../src/static';

let directory: string;
let client: Awaited<ReturnType<typeof createStaticHandler>>;
let pages: Awaited<ReturnType<typeof createStaticHandler>>;
const request = (path: string, init?: RequestInit) =>
  new Request(`http://localhost${path}`, init);
const get = async (
  path: string,
  headers?: ConstructorParameters<typeof Headers>[0]
) => (await client(request(path, { headers })))!;
// Brotli-encoded "0123456789"; Bun's handler serves these bytes unchanged.
const brotli = new Uint8Array([
  139, 4, 128, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 3,
]);

beforeAll(async () => {
  directory = `${import.meta.dir}/../.cache/static-tests-${crypto.randomUUID()}`;
  const outside = `${directory}-outside`;
  await Bun.$`mkdir -p ${directory}/base/_app/immutable ${directory}/base/blog ${directory}/base/.private ${outside}`;
  const files: Record<string, string | Uint8Array> = {
    'base/hello.txt': '0123456789',
    'base/hello.txt.gz': Bun.gzipSync('0123456789'),
    'base/hello.txt.br': brotli,
    'base/space name.txt': 'encoded',
    'base/café.txt': 'unicode',
    'base/_app/immutable/app.js': 'export default 1;',
    'base/about.html': '<h1>About</h1>',
    'base/space #?.html': '<h1>Encoded</h1>',
    'base/blog/index.html': '<h1>Blog</h1>',
    'base/index.html': '<h1>Home</h1>',
    'base/unlisted.html': 'private page',
    'base/.secret': 'secret',
    'base/.private/file.txt': 'secret',
    'base/.well-known/security.txt': 'public contact',
    'base/.well-known/.secret': 'secret',
  };
  for (const [path, contents] of Object.entries(files)) {
    await Bun.write(`${directory}/${path}`, contents);
  }
  await Bun.write(`${outside}/secret.txt`, 'outside');
  await Bun.$`ln -s ${outside}/secret.txt ${directory}/base/link.txt`;
  await Bun.$`ln -s ${outside} ${directory}/base/linkdir`;
  client = await createStaticHandler(directory, {
    immutable: '/base/_app/immutable/',
  });
  pages = await createStaticHandler(directory, {
    prerendered: new Set([
      '/base/',
      '/base/about',
      '/base/blog/',
      '/base/space #?',
    ]),
  });
});

afterAll(async () => {
  await Bun.$`rm -rf ${directory} ${directory + '-outside'}`;
});

describe('indexed client files', () => {
  test('a missing build directory yields a fallback handler', async () => {
    const handler = await createStaticHandler(`${directory}/missing`);
    expect(await handler(request('/hello.txt'))).toBeUndefined();
  });

  test('direct files retain the base path and content type', async () => {
    const response = await get('/base/hello.txt?cache=1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toStartWith('text/plain');
    expect(await response.text()).toBe('0123456789');
    expect(await client(request('/hello.txt'))).toBeUndefined();
  });

  test('encoded names are decoded once, malformed URLs fall through', async () => {
    expect(await (await get('/base/space%20name.txt')).text()).toBe('encoded');
    expect(await (await get('/base/caf%C3%A9.txt')).text()).toBe('unicode');
    for (const path of ['/base/%zz', '/base/space%2520name.txt']) {
      expect(await client(request(path))).toBeUndefined();
    }
  });

  test('hidden, traversal, symlink and unindexed files fall through', async () => {
    await Bun.write(`${directory}/base/new.txt`, 'created after indexing');
    for (const path of [
      '/base/.secret',
      '/base/%2esecret',
      '/base/.private/file.txt',
      '/base/..%2foutside/secret.txt',
      '/base/%2e%2e%5coutside%5csecret.txt',
      '/base/%00hello.txt',
      '/base/link.txt',
      '/base/linkdir/secret.txt',
      '/base/new.txt',
      '/base//hello.txt',
    ]) {
      expect(await client(request(path))).toBeUndefined();
    }
  });

  test('HEAD returns GET metadata without a body, POST falls through', async () => {
    const response = (await client(
      request('/base/hello.txt', {
        method: 'HEAD',
        headers: { range: 'bytes=0-2' },
      })
    ))!;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('10');
    expect(await response.text()).toBe('');
    expect(
      await client(request('/base/hello.txt', { method: 'POST' }))
    ).toBeUndefined();
  });

  test('well-known public files are allowed without exposing hidden children', async () => {
    expect(await (await get('/base/.well-known/security.txt')).text()).toBe(
      'public contact'
    );
    expect(await client(request('/base/.well-known/.secret'))).toBeUndefined();
  });

  test('immutable cache applies only to the supplied URL prefix', async () => {
    expect(
      (await get('/base/_app/immutable/app.js')).headers.get('cache-control')
    ).toBe('public,max-age=31536000,immutable');
    expect((await get('/base/hello.txt')).headers.has('cache-control')).toBe(
      false
    );
  });
});

describe('compression', () => {
  test.each([
    ['br, gzip', 'br'],
    ['br;q=0.2, gzip;q=0.8', 'gzip'],
    ['br;q=0, gzip', 'gzip'],
    ['br;q=0, gzip;q=0', null],
    ['*;q=1, br;q=0', 'gzip'],
    ['gzip;q=0.000, br;q=0.000', null],
    ['gzip;q=garbage', null],
    ['', null],
  ])('%s selects %s', async (accept, encoding) => {
    const response = await get('/base/hello.txt', {
      'accept-encoding': accept!,
    });
    expect(response.headers.get('content-encoding')).toBe(encoding);
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('content-type')).toStartWith('text/plain');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (encoding === 'br') {
      expect(bytes).toEqual(brotli);
    } else {
      expect(
        new TextDecoder().decode(
          encoding === 'gzip' ? Bun.gunzipSync(bytes) : bytes
        )
      ).toBe('0123456789');
    }
  });

  test('missing compressed variant falls back and HEAD negotiates', async () => {
    expect(
      (
        await get('/base/space%20name.txt', { 'accept-encoding': 'br, gzip' })
      ).headers.has('content-encoding')
    ).toBe(false);
    const response = (await client(
      request('/base/hello.txt', {
        method: 'HEAD',
        headers: { 'accept-encoding': 'br' },
      })
    ))!;
    expect(response.headers.get('content-encoding')).toBe('br');
    expect(response.headers.get('content-length')).toBe(String(brotli.length));
    expect(await response.text()).toBe('');
  });

  test('Bun HTTP streaming yields decoded gzip and Brotli responses', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: async request =>
        (await client(request)) ??
        new Response(null, {
          status: 404,
        }),
    });
    try {
      for (const encoding of ['br', 'gzip']) {
        const response = await fetch(new URL('/base/hello.txt', server.url), {
          headers: { 'accept-encoding': encoding },
        });
        expect(response.headers.get('content-encoding')).toBe(encoding);
        expect(await response.text()).toBe('0123456789');
      }
    } finally {
      await server.stop(true);
    }
  });
});

describe('conditional requests and ranges', () => {
  test('etag list and wildcard match, etag takes precedence over dates', async () => {
    const original = await get('/base/hello.txt');
    const etag = original.headers.get('etag')!;
    const modified = original.headers.get('last-modified')!;
    for (const value of [etag, `"other", ${etag}`, '*', etag.slice(2)]) {
      const response = await get('/base/hello.txt', { 'if-none-match': value });
      expect(response.status).toBe(304);
      expect(await response.text()).toBe('');
      expect(response.headers.has('content-length')).toBe(false);
    }
    expect(
      (
        await get('/base/hello.txt', {
          'if-modified-since': modified,
        })
      ).status
    ).toBe(304);
    expect(
      (
        await get('/base/hello.txt', {
          'if-none-match': '"wrong"',
          'if-modified-since': modified,
        })
      ).status
    ).toBe(200);
    expect(
      (
        await get('/base/hello.txt', {
          'if-modified-since': 'invalid',
        })
      ).status
    ).toBe(200);
    expect(
      (
        await get('/base/hello.txt', {
          'accept-encoding': 'br',
          'if-none-match': etag,
        })
      ).status
    ).toBe(200);
  });

  test.each([
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=7-999', '789', 'bytes 7-9/10'],
    ['bytes=-999', '0123456789', 'bytes 0-9/10'],
  ])('%s serves a single range', async (range, body, contentRange) => {
    const response = await get('/base/hello.txt', { range });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(contentRange);
    expect(response.headers.get('content-length')).toBe(String(body.length));
    expect(await response.text()).toBe(body);
  });

  test('unsatisfiable ranges return 416; unsupported ranges are ignored', async () => {
    for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=-0']) {
      const response = await get('/base/hello.txt', { range });
      expect(response.status).toBe(416);
      expect(response.headers.get('content-range')).toBe('bytes */10');
      expect(await response.text()).toBe('');
    }
    for (const range of ['bytes=0-1,3-4', 'garbage', 'items=0-2']) {
      expect((await get('/base/hello.txt', { range })).status).toBe(200);
    }
  });

  test('If-Range accepts fresh dates, not weak etags or stale validators', async () => {
    const original = await get('/base/hello.txt');
    expect(
      (
        await get('/base/hello.txt', {
          range: 'bytes=0-2',
          'if-range': original.headers.get('last-modified')!,
        })
      ).status
    ).toBe(206);
    for (const value of [
      original.headers.get('etag')!,
      '"different"',
      'Thu, 01 Jan 1970 00:00:00 GMT',
      'invalid',
    ]) {
      expect(
        (
          await get('/base/hello.txt', {
            range: 'bytes=0-2',
            'if-range': value,
          })
        ).status
      ).toBe(200);
    }
  });
});

describe('prerendered pages', () => {
  test('Kit metadata serves non-HTML assets and exact redirect targets', async () => {
    const handler = await createStaticHandler(directory, {
      prerendered: new Set(['/base/custom', '/base/api.json']),
      pages: new Map([['/base/custom', 'base/about.html']]),
      assets: new Set(['base/hello.txt']),
      types: new Map([['/base/hello.txt', 'application/custom']]),
      redirects: new Map([
        ['/base/old', { status: 307, location: '/base/custom?source=old' }],
      ]),
    });
    expect(await (await handler(request('/base/custom')))!.text()).toBe(
      '<h1>About</h1>'
    );
    const asset = (await handler(request('/base/hello.txt')))!;
    expect(await asset.text()).toBe('0123456789');
    expect(asset.headers.get('content-type')).toBe('application/custom');
    expect(await handler(request('/base/unlisted.html'))).toBeUndefined();
    const redirect = (await handler(request('/base/old')))!;
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get('location')).toBe('/base/custom?source=old');
  });

  test('only listed routes map to HTML with the full base path', async () => {
    for (const path of ['/base/', '/base/about', '/base/blog/']) {
      const response = (await pages(request(path)))!;
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toStartWith('text/html');
    }
    for (const path of [
      '/about',
      '/base/unlisted',
      '/base/unlisted.html',
      '/base/about.html',
      '/base/hello.txt',
    ]) {
      expect(await pages(request(path))).toBeUndefined();
    }
  });

  test('slash redirects preserve query and apply only to listed pages', async () => {
    for (const [path, location] of [
      ['/base/about/?q=a%20b', '/base/about?q=a%20b'],
      ['/base/blog?tag=x&n=2', '/base/blog/?tag=x&n=2'],
      ['/base', '/base/'],
    ]) {
      const response = (await pages(request(path!)))!;
      expect(response.status).toBe(308);
      expect(response.headers.get('location')).toBe(location!);
    }
    expect(await pages(request('/base/unknown/'))).toBeUndefined();
    expect(
      await pages(request('/base/blog', { method: 'POST' }))
    ).toBeUndefined();
  });

  test('encoded prerendered paths and redirects keep path delimiters encoded', async () => {
    const response = (await pages(request('/base/space%20%23%3F')))!;
    expect(await response.text()).toBe('<h1>Encoded</h1>');
    const redirect = (await pages(request('/base/space%20%23%3F/?q=a%20b')))!;
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get('location')).toBe(
      '/base/space%20%23%3F?q=a%20b'
    );
  });
});

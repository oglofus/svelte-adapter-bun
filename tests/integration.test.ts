import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';

const root = resolve(import.meta.dir, '..');
const fixture = resolve(root, 'tests/fixtures/app');
const bun = process.execPath;
const asset = '0123456789\n';

async function deadline<T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${label}`)),
          milliseconds
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

// Only adapter variables supplied by a test participate; a developer's shell
// configuration must not change these integration servers or builds.
function environment(extra: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('ADAPTER_') || key.startsWith('FIXTURE_'))
      delete env[key];
  }
  return { ...env, ...extra };
}

async function command(
  args: string[],
  cwd: string,
  extra: Record<string, string> = {}
) {
  const child = Bun.spawn([bun, ...args], {
    cwd,
    env: environment(extra),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  try {
    const code = await deadline(
      child.exited,
      90_000,
      `build ${args.join(' ')}`
    );
    const [stdout, stderr] = await output;
    if (code !== 0)
      throw new Error(`Build exited ${code}\n${stdout}\n${stderr}`);
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await deadline(child.exited, 5_000, 'build cleanup');
  }
}

async function buildFixture(external = false) {
  await command(
    [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'],
    fixture,
    external ? { FIXTURE_EXTERNAL_ASSETS: '1' } : {}
  );
}

async function start(extra: Record<string, string> = {}, project = fixture) {
  const child = Bun.spawn([bun, 'build/index.js'], {
    cwd: project,
    env: environment({
      // Deliberately conflicting unprefixed variables prove envPrefix is used.
      HOST: 'invalid.example',
      PORT: '65536',
      ORIGIN: 'https://ignored.example',
      ADAPTER_HOST: '127.0.0.1',
      ADAPTER_PORT: '0',
      ...extra,
    }),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let stdout = '';
  const stderr = new Response(child.stderr).text();
  const listeners = new Set<() => void>();
  const drain = (async () => {
    for await (const chunk of child.stdout) {
      stdout += new TextDecoder().decode(chunk);
      for (const notify of listeners) notify();
    }
  })();
  async function waitFor(pattern: RegExp) {
    let notify: () => void = () => {};
    const matched = new Promise<RegExpMatchArray>(resolve => {
      notify = () => {
        const match = stdout.match(pattern);
        if (match) resolve(match);
      };
      listeners.add(notify);
      notify();
    });
    try {
      return await deadline(
        Promise.race([
          matched,
          child.exited.then(async code => {
            throw new Error(
              `Server exited ${code}\n${stdout}\n${await stderr}`
            );
          }),
        ]),
        10_000,
        `server stdout ${pattern}`
      );
    } finally {
      listeners.delete(notify);
    }
  }
  async function stop() {
    if (child.exitCode === null) child.kill('SIGTERM');
    try {
      await deadline(child.exited, 5_000, 'SIGTERM shutdown');
    } catch (error) {
      // SIGTERM is always attempted first; force cleanup of a regressed server.
      child.kill('SIGKILL');
      await child.exited;
      throw error;
    } finally {
      await drain;
    }
  }
  try {
    const match = await waitFor(/Listening on (http:\/\/127\.0\.0\.1:\d+\/)/);
    const origin = match[1]!.replace(/\/$/, '');
    return {
      child,
      origin,
      waitFor,
      stop,
      fetch: (path: string, init?: RequestInit) =>
        fetch(`${origin}${path}`, {
          ...init,
          signal: AbortSignal.timeout(5_000),
        }),
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

type RunningServer = Awaited<ReturnType<typeof start>>;

test('non-instrumented hooks see runtime environment with and without WebSockets', async () => {
  await command(['run', 'build'], root);
  const project = resolve(root, 'tests/fixtures/env');
  for (const websocket of [false, true]) {
    await command(
      [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'],
      project,
      {
        SECRET: 'build-secret',
        ...(websocket ? { FIXTURE_WEBSOCKET: '1' } : {}),
      }
    );
    const server = await start({ SECRET: 'runtime-secret' }, project);
    try {
      expect(await (await server.fetch('/')).json()).toEqual({
        secret: 'runtime-secret',
      });
    } finally {
      await server.stop();
    }
  }
}, 180_000);

describe('generated Bun server (Kit 3)', () => {
  let server: RunningServer;

  beforeAll(async () => {
    await command(['run', 'build'], root);
    await buildFixture();
    server = await start();
  }, 180_000);

  afterAll(async () => {
    if (server) await server.stop();
  }, 10_000);

  test('SSR keeps Svelte context and destruction isolated per request; instrumentation precedes hooks', async () => {
    const responses = await Promise.all(
      ['Alice', 'Bob', 'Alice'].map(name => server.fetch(`/base?name=${name}`))
    );
    for (const [index, response] of responses.entries()) {
      expect(response.status).toBe(200);
      expect(response.headers.get('x-fixture-startup')).toBe(
        'instrumentation-before-hooks'
      );
      const html = await response.text();
      expect(html).toContain(`Hello ${['Alice', 'Bob', 'Alice'][index]}`);
      expect(html.match(/child-render:1/g)).toHaveLength(1);
      expect(html).toContain('<title>Adapter integration</title>');
    }
  });

  test('POST echo exposes the original request, native platform and client address', async () => {
    const response = await server.fetch('/base/api?echo=a%20b', {
      method: 'POST',
      body: 'hello from Bun',
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      body: 'hello from Bun',
      address: '127.0.0.1',
      origin: server.origin,
      query: '?echo=a%20b',
      platform: {
        server: true,
        request: true,
        originalURL: `${server.origin}/base/api?echo=a%20b`,
      },
    });
  });

  test('$app/server reads an imported static file from the adapter output', async () => {
    const response = await server.fetch('/base/read');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Imported through $app/server.\n');
  });

  test('static assets preserve base, HEAD metadata, ranges and ETags', async () => {
    const response = await server.fetch('/base/hello.txt', {
      headers: { 'accept-encoding': 'identity' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(asset);
    const etag = response.headers.get('etag');
    expect(etag).not.toBeNull();
    const head = await server.fetch('/base/hello.txt', {
      method: 'HEAD',
      headers: { 'accept-encoding': 'identity' },
    });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(asset.length));
    expect(await head.text()).toBe('');
    const range = await server.fetch('/base/hello.txt', {
      headers: { range: 'bytes=2-5', 'accept-encoding': 'identity' },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe(
      `bytes 2-5/${asset.length}`
    );
    expect(await range.text()).toBe('2345');
    const cached = await server.fetch('/base/hello.txt', {
      headers: { 'if-none-match': etag!, 'accept-encoding': 'identity' },
    });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
    expect((await server.fetch('/hello.txt')).status).toBe(404);
  });

  test.each(['gzip', 'br'])('generated assets negotiate %s', async encoding => {
    const response = await server.fetch('/base/hello.txt', {
      headers: { 'accept-encoding': encoding },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBe(encoding);
    expect(response.headers.get('vary')).toContain('Accept-Encoding');
    // Bun fetch decodes the body while retaining the wire encoding header.
    expect(await response.text()).toBe(asset);
  });

  test('prerendered page and slash redirect preserve query strings', async () => {
    const page = await server.fetch('/base/prerendered/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Prerendered: prerender dependency');
    const redirect = await server.fetch('/base/prerendered?tag=a%20b&n=2', {
      redirect: 'manual',
    });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get('location')).toBe(
      '/base/prerendered/?tag=a%20b&n=2'
    );
  });

  test.each([
    ['prerendered.json', 'prerender endpoint'],
    ['dependency.json', 'prerender dependency'],
  ])('serves prerendered JSON %s', async (path, message) => {
    const response = await server.fetch(`/base/${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ message });
  });

  test('WebSocket greeting and echo use the legacy awaited upgrade hook', async () => {
    const socket = new WebSocket(
      `${server.origin.replace('http:', 'ws:')}/base/ws?token=allowed`
    );
    try {
      const messages: string[] = [];
      const done = new Promise<void>((resolve, reject) => {
        socket.onmessage = event => {
          messages.push(String(event.data));
          if (messages.length === 1) socket.send('echo this');
          if (messages.length === 2) resolve();
        };
        socket.onerror = () => reject(new Error('WebSocket connection failed'));
        socket.onclose = () => {
          if (messages.length < 2)
            reject(new Error('WebSocket closed before echo'));
        };
      });
      await deadline(done, 5_000, 'WebSocket greeting and echo');
      expect(messages).toEqual(['hello:fixture', 'echo this']);
    } finally {
      socket.close();
    }
  });

  test('WebSocket authorization rejects the HTTP upgrade', async () => {
    const response = await server.fetch('/base/ws?token=denied', {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  });

  test('unknown routes and requests outside the base are 404', async () => {
    for (const path of ['/base/missing', '/api', '/prerendered/']) {
      expect((await server.fetch(path)).status).toBe(404);
    }
  });

  test('prefixed ORIGIN overrides proxy origin while XFF_DEPTH chooses the trusted address', async () => {
    const other = await start({
      ADAPTER_ORIGIN: 'https://public.example:8443',
      ADAPTER_ADDRESS_HEADER: 'X-Forwarded-For',
      ADAPTER_XFF_DEPTH: '2',
      ADAPTER_HOST_HEADER: 'x-forwarded-host',
      ADAPTER_PROTOCOL_HEADER: 'x-forwarded-proto',
    });
    try {
      const response = await other.fetch('/base/api', {
        method: 'POST',
        body: 'proxy',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '192.0.2.1, 198.51.100.2, 203.0.113.3',
          'x-forwarded-host': 'ignored.example',
          'x-forwarded-proto': 'http',
        },
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        origin: string;
        address: string;
        platform: { originalURL: string };
      };
      expect(data.origin).toBe('https://public.example:8443');
      expect(data.address).toBe('198.51.100.2');
      expect(data.platform.originalURL).toBe(`${other.origin}/base/api`);
    } finally {
      await other.stop();
    }
  }, 20_000);

  test('prefixed proxy protocol, host and port reconstruct the external origin', async () => {
    const other = await start({
      ADAPTER_PROTOCOL_HEADER: 'x-forwarded-proto',
      ADAPTER_HOST_HEADER: 'x-forwarded-host',
      ADAPTER_PORT_HEADER: 'x-forwarded-port',
    });
    try {
      const response = await other.fetch('/base/api', {
        method: 'POST',
        body: 'proxy',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'proxy.example',
          'x-forwarded-port': '9443',
        },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        origin: 'https://proxy.example:9443',
      });
    } finally {
      await other.stop();
    }
  }, 20_000);

  test('prefixed body limit rejects oversized requests', async () => {
    const other = await start({ ADAPTER_BODY_SIZE_LIMIT: '32' });
    try {
      const small = await other.fetch('/base/api', {
        method: 'POST',
        body: 'small',
        headers: { 'content-type': 'application/json' },
      });
      expect(small.status).toBe(200);
      const large = await other.fetch('/base/api', {
        method: 'POST',
        body: 'x'.repeat(33),
        headers: { 'content-type': 'application/json' },
      });
      expect(large.status).toBe(413);
    } finally {
      await other.stop();
    }
  }, 20_000);

  test('SIGTERM drains an in-flight request and exits cleanly', async () => {
    const other = await start();
    try {
      const pending = other.fetch('/base/slow');
      await other.waitFor(/fixture:slow-started/);
      other.child.kill('SIGTERM');
      const response = await pending;
      expect(await response.text()).toBe('finished-before-shutdown');
      expect(await deadline(other.child.exited, 5_000, 'graceful exit')).toBe(
        0
      );
    } finally {
      await other.stop();
    }
  }, 20_000);
});

describe('external asset hosting', () => {
  let server: RunningServer;
  beforeAll(async () => {
    await buildFixture(true);
    server = await start();
  }, 100_000);
  afterAll(async () => {
    if (server) await server.stop();
  }, 10_000);

  test('serveAssets:false falls through to Kit; precompress:false writes no compressed variants', async () => {
    for (const path of [
      '/base/hello.txt',
      '/base/prerendered/',
      '/base/prerendered.json',
    ]) {
      expect((await server.fetch(path)).status).toBe(404);
    }
    expect((await server.fetch('/base')).status).toBe(200);
    const files = await readdir(resolve(fixture, 'build'), { recursive: true });
    expect(
      files.some(path => path.endsWith('.br') || path.endsWith('.gz'))
    ).toBe(false);
    // Disabling HTTP asset serving must not disable server-side read().
    expect(await (await server.fetch('/base/read')).text()).toBe(
      'Imported through $app/server.\n'
    );
  });
});

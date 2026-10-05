type StaticOptions = {
  prerendered?: Set<string>;
  immutable?: string;
  pages?: Map<string, string>;
  assets?: Set<string>;
  types?: Map<string, string>;
  redirects?: Map<string, { status: number; location: string }>;
};

type StaticFile = {
  file: ReturnType<typeof Bun.file>;
  size: number;
  modified: number;
  etag: string;
};

/** Index a build directory once; requests can only address indexed regular files. */
export async function createStaticHandler(
  directory: string,
  options: StaticOptions = {}
): Promise<
  (request: Request) => Response | undefined | Promise<Response | undefined>
> {
  const files = new Map<string, StaticFile>();
  const glob = new Bun.Glob('**/*');
  try {
    for await (const path of glob.scan({
      cwd: directory,
      onlyFiles: true,
      followSymlinks: false,
      dot: true,
    })) {
      if (!safePath('/' + path)) continue;
      const file = Bun.file(`${directory}/${path}`);
      const stat = await file.stat();
      if (!stat.isFile()) continue;
      files.set(path, {
        file,
        size: stat.size,
        modified: Math.floor(stat.mtimeMs / 1000) * 1000,
        // Metadata validators are deliberately weak, not claims of byte identity.
        etag: `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`,
      });
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return () => undefined;
    throw error;
  }

  const pages = new Map(options.pages);
  if (options.prerendered) {
    for (const pathname of options.prerendered) {
      if (pages.has(pathname)) continue;
      if (!safePath(pathname)) continue;
      const stem = pathname.slice(1).replace(/\/$/, '');
      const candidates =
        pathname === '/'
          ? ['index.html']
          : pathname.endsWith('/')
            ? [`${stem}/index.html`, `${stem}.html`]
            : [`${stem}.html`, `${stem}/index.html`];
      const path = candidates.find(candidate => files.has(candidate));
      if (path) pages.set(pathname, path);
    }
  }

  return request => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return;
    const url = new URL(request.url);
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return;
    }
    if (!safePath(pathname)) return;

    let path: string | undefined;
    if (options.prerendered) {
      const redirect = options.redirects?.get(pathname);
      if (redirect) {
        return new Response(null, {
          status: redirect.status,
          headers: { location: redirect.location },
        });
      }
      path = pages.get(pathname);
      if (!path && options.assets?.has(pathname.slice(1))) {
        path = pathname.slice(1);
      }
      if (!path && pathname !== '/') {
        const canonical = pathname.endsWith('/')
          ? pathname.slice(0, -1)
          : pathname + '/';
        if (pages.has(canonical)) {
          // Encode the decoded path again so spaces, ?, # and Unicode remain a path.
          const location =
            canonical.split('/').map(encodeURIComponent).join('/') + url.search;
          return new Response(null, { status: 308, headers: { location } });
        }
      }
    } else {
      path = pathname.slice(1);
    }
    if (!path) return;
    const original = files.get(path);
    if (!original) return;

    let selected = original;
    let encoding: string | undefined;
    const preferences = encodingPreferences(
      request.headers.get('accept-encoding')
    );
    for (const candidate of preferences) {
      const compressed = files.get(path + (candidate === 'br' ? '.br' : '.gz'));
      if (compressed) {
        selected = compressed;
        encoding = candidate;
        break;
      }
    }

    const headers = new Headers({
      'content-type':
        options.types?.get(pathname) ||
        original.file.type ||
        'application/octet-stream',
      'content-length': String(selected.size),
      'last-modified': new Date(selected.modified).toUTCString(),
      etag: selected.etag,
      'accept-ranges': 'bytes',
      vary: 'Accept-Encoding',
    });
    if (encoding) headers.set('content-encoding', encoding);
    if (options.immutable && pathname.startsWith(options.immutable)) {
      headers.set('cache-control', 'public,max-age=31536000,immutable');
    }

    const noneMatch = request.headers.get('if-none-match');
    const since = request.headers.get('if-modified-since');
    if (
      noneMatch !== null
        ? noneMatch.split(',').some(tag => {
            const value = tag.trim();
            return (
              value === '*' ||
              value.replace(/^W\//, '') === selected.etag.replace(/^W\//, '')
            );
          })
        : since !== null && selected.modified <= Date.parse(since)
    ) {
      headers.delete('content-length');
      return new Response(null, { status: 304, headers });
    }

    // Range applies to GET only, and addresses bytes of the selected representation.
    const range = request.headers.get('range');
    const ifRange = request.headers.get('if-range');
    const rangeAllowed =
      !ifRange ||
      (!ifRange.startsWith('"') &&
        !ifRange.startsWith('W/') &&
        selected.modified <= Date.parse(ifRange));
    if (request.method === 'GET' && range && rangeAllowed) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match && (match[1] || match[2])) {
        const start = match[1]
          ? Number(match[1])
          : Math.max(0, selected.size - Number(match[2]));
        const end = match[1]
          ? match[2]
            ? Math.min(Number(match[2]), selected.size - 1)
            : selected.size - 1
          : selected.size - 1;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= selected.size
        ) {
          headers.set('content-range', `bytes */${selected.size}`);
          headers.set('content-length', '0');
          return new Response(null, { status: 416, headers });
        }
        headers.set('content-range', `bytes ${start}-${end}/${selected.size}`);
        headers.set('content-length', String(end - start + 1));
        return new Response(selected.file.slice(start, end + 1), {
          status: 206,
          headers,
        });
      }
    }
    return new Response(request.method === 'HEAD' ? null : selected.file, {
      headers,
    });
  };
}

function safePath(path: string): boolean {
  return (
    path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    (path === '/' ||
      path
        .slice(1)
        .replace(/\/$/, '')
        .split('/')
        .every(
          segment =>
            segment.length > 0 &&
            (!segment.startsWith('.') || segment === '.well-known')
        ))
  );
}

function encodingPreferences(header: string | null): string[] {
  if (!header) return [];
  const qualities = new Map<string, number>();
  for (const part of header.split(',')) {
    const [name, ...parameters] = part.trim().toLowerCase().split(';');
    let quality = 1;
    for (const parameter of parameters) {
      const match = /^\s*q\s*=\s*(.*)$/.exec(parameter);
      if (match) {
        const value = match[1]!.trim();
        quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value)
          ? Number(value)
          : 0;
      }
    }
    qualities.set(name!.trim(), quality);
  }
  const quality = (name: string) =>
    qualities.get(name) ?? qualities.get('*') ?? 0;
  return ['br', 'gzip']
    .filter(name => quality(name) > 0)
    .sort((a, b) => quality(b) - quality(a));
}

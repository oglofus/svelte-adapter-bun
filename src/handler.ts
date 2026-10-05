import {
  server,
  base,
  appDir,
  prerendered,
  prerenderedPages,
  prerenderedAssets,
  prerenderedTypes,
  redirects,
  serveAssets,
  envPrefix,
  origin as configuredOrigin,
} from 'svelte-adapter-bun:manifest';
import { env } from './env.js';
import { createStaticHandler } from './static.js';
import { fileURLToPath } from 'node:url';

const origin = env('ORIGIN', configuredOrigin);
const addressHeader = env('ADDRESS_HEADER', '').toLowerCase();
const protocolHeader = env('PROTOCOL_HEADER', '').toLowerCase();
const hostHeader = env('HOST_HEADER', '').toLowerCase();
const portHeader = env('PORT_HEADER', '').toLowerCase();
const depth = env('XFF_DEPTH', '1');
const xffDepth = Number(depth);
if (!/^\d+$/.test(depth) || !Number.isSafeInteger(xffDepth) || xffDepth < 1) {
  throw new Error(`${envPrefix}XFF_DEPTH must be a positive integer`);
}

// Runtime chunks are kept at the root of server/, beside adapter-index.js.
const directory = fileURLToPath(new URL('../', import.meta.url));
await server.init({
  env: Bun.env as Record<string, string>,
  read: file => Bun.file(`${directory}/client${base}/${file}`).stream(),
});

// Kit initializes dynamic environment modules before importing user hooks.
// Loading the optional export earlier can capture uninitialized environment
// values or introduce a top-level-await cycle with the generated server.
export const websocket = (await import('WEBSOCKET')).default;

const staticHandlers = serveAssets
  ? [
      await createStaticHandler(`${directory}/client`, {
        immutable: `${base}/${appDir}/immutable/`,
      }),
      await createStaticHandler(`${directory}/prerendered`, {
        prerendered,
        pages: prerenderedPages,
        assets: prerenderedAssets,
        types: prerenderedTypes,
        redirects,
      }),
    ]
  : [];

export async function handler(
  request: Request,
  bunServer: Bun.Server<unknown>
) {
  for (const serve of staticHandlers) {
    const response = await serve(request);
    if (response) return response;
  }
  const url = new URL(request.url);
  if (origin) {
    const external = new URL(origin);
    url.protocol = external.protocol;
    url.host = external.host;
  } else if (protocolHeader || hostHeader || portHeader) {
    const protocol =
      (protocolHeader && request.headers.get(protocolHeader)) ||
      url.protocol.slice(0, -1);
    const host = (hostHeader && request.headers.get(hostHeader)) || url.host;
    const external = new URL(`${protocol}://${host}`);
    const port = portHeader && request.headers.get(portHeader);
    if (port) external.port = port;
    url.protocol = external.protocol;
    url.host = external.host;
  }
  let upgraded = false;
  // Track upgrades from legacy hooks too. Bind all other native methods to
  // the real Bun server because they rely on its internal receiver.
  const platformServer = new Proxy(bunServer, {
    get(target, property) {
      if (property === 'upgrade') {
        return (
          original: Request,
          options?: Parameters<typeof bunServer.upgrade>[1]
        ) => {
          if (!websocket) return false;
          const success = target.upgrade(
            original,
            options ?? { data: undefined }
          );
          if (original === request && success) upgraded = true;
          return success;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const response = await server.respond(new Request(url.href, request), {
    platform: {
      server: platformServer as App.Platform['server'],
      request,
      upgrade(options?: Parameters<typeof bunServer.upgrade>[1]) {
        return platformServer.upgrade(request, options ?? { data: undefined });
      },
    },
    getClientAddress() {
      if (!addressHeader) {
        const address = bunServer.requestIP(request)?.address;
        if (!address)
          throw new Error(
            'Client address unavailable (Unix socket). Configure ADDRESS_HEADER behind a trusted proxy.'
          );
        return address;
      }
      const value = request.headers.get(addressHeader);
      if (!value)
        throw new Error(
          `${envPrefix}ADDRESS_HEADER=${addressHeader} is absent from the request`
        );
      if (addressHeader !== 'x-forwarded-for') return value;
      const addresses = value.split(',').map(address => address.trim());
      const address = addresses[addresses.length - xffDepth];
      if (!address)
        throw new Error(
          `${envPrefix}XFF_DEPTH=${xffDepth} exceeds the supplied addresses`
        );
      return address;
    },
  });
  // Bun owns the 101 response. SvelteKit still requires a normal hook Response.
  return upgraded ? undefined : response;
}

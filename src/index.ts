import { env } from './env.js';
import { handler, websocket } from './handler.js';
import { parseBytes, parseInteger } from './options.js';

export const path = env('SOCKET_PATH');
export const host = env('HOST', '0.0.0.0');
export const port = path
  ? undefined
  : parseInteger('PORT', env('PORT', '3000'), 0, 65535);
const options = {
  maxRequestBodySize: parseBytes(env('BODY_SIZE_LIMIT', '512K')),
  fetch: handler,
  ...(path
    ? { unix: path }
    : {
        hostname: host,
        port,
        idleTimeout: parseInteger(
          'IDLE_TIMEOUT',
          env('IDLE_TIMEOUT', '10'),
          0,
          255
        ),
      }),
};

export const server = websocket
  ? Bun.serve<unknown>({ ...options, websocket })
  : Bun.serve<undefined>({
      ...options,
      fetch: async (request, server) =>
        (await handler(request, server)) ??
        new Response('Unexpected upgrade', { status: 500 }),
    });
console.log(
  `Listening on ${path || server.url}${websocket ? ' with WebSocket' : ''}`
);

let shuttingDown = false;
async function shutdown(reason: 'SIGINT' | 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => void server.stop(true), 30_000);
  try {
    await server.stop();
    // @ts-expect-error adapter lifecycle event
    process.emit('sveltekit:shutdown', reason);
  } finally {
    clearTimeout(timeout);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
}
const onInterrupt = () => void shutdown('SIGINT');
const onTerminate = () => void shutdown('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);

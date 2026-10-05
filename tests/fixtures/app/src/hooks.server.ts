import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';

// Captured at module evaluation, not when the first request arrives.
const startup = globalThis.fixtureStartup;

export const websocket: Bun.WebSocketHandler<{ user: string }> = {
  open(socket) {
    socket.send(`hello:${socket.data.user}`);
  },
  message(socket, message) {
    socket.send(message);
  },
};

export const handle: Handle = async ({ event, resolve }) => {
  if (!building && startup !== 'instrumentation-before-hooks') {
    return new Response('Instrumentation did not precede hooks', {
      status: 500,
    });
  }
  if (event.url.pathname === '/base/ws') {
    if (event.url.searchParams.get('token') !== 'allowed') {
      return new Response('Unauthorized', { status: 401 });
    }
    const platform = event.platform!;
    // Keep the legacy awaited API and placeholder response: Bun owns the wire 101.
    const upgraded = await platform.server.upgrade(platform.request, {
      data: { user: 'fixture' },
    });
    return new Response(null, { status: upgraded ? 101 : 400 });
  }
  if (event.url.pathname === '/base/slow') {
    console.log('fixture:slow-started');
    await Bun.sleep(250);
    return new Response('finished-before-shutdown');
  }
  const response = await resolve(event);
  if (startup) response.headers.set('x-fixture-startup', startup);
  return response;
};

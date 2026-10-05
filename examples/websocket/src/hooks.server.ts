import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.headers.get('connection')?.toLowerCase().includes('upgrade') &&
    request.headers.get('upgrade')?.toLowerCase() === 'websocket' &&
    url.pathname === '/ws'
  ) {
    // Authenticate and authorize here before upgrading.
    if (event.platform?.upgrade({ data: undefined })) {
      // Bun sends the 101 response; the adapter discards this placeholder.
      return new Response(null, { status: 204 });
    }
    return new Response('WebSocket upgrade unavailable', { status: 400 });
  }

  return resolve(event);
};

export const websocket: Bun.WebSocketHandler<undefined> = {
  open(ws) {
    ws.send('Slava Ukraїni');
  },
  message(ws, message) {
    ws.send(message);
  },
};

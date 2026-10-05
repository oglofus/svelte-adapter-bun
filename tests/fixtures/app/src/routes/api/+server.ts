import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({
  request,
  url,
  getClientAddress,
  platform,
}) =>
  json({
    body: await request.text(),
    address: getClientAddress(),
    origin: url.origin,
    query: url.search,
    platform: {
      server: typeof platform?.server.upgrade === 'function',
      request: platform?.request instanceof Request,
      originalURL: platform?.request.url,
    },
  });

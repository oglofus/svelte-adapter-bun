declare module 'svelte-adapter-bun:manifest' {
  import type { Server } from '@sveltejs/kit';
  export const server: Server;
  export const base: string;
  export const appDir: string;
  export const prerendered: Set<string>;
  export const prerenderedPages: Map<string, string>;
  export const prerenderedAssets: Set<string>;
  export const prerenderedTypes: Map<string, string>;
  export const redirects: Map<string, { status: number; location: string }>;
  export const envPrefix: string;
  export const serveAssets: boolean;
  export const origin: string | undefined;
}

declare module 'WEBSOCKET' {
  const websocket: Bun.WebSocketHandler<unknown> | undefined;
  export default websocket;
}

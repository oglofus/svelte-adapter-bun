export interface AdapterOptions {
  /** Output directory. @default 'build' */
  out?: string;
  /** Create gzip and brotli variants of assets. @default true */
  precompress?: boolean;
  /** Prefix for deployment environment variables. @default '' */
  envPrefix?: string;
  /** Serve static assets and prerendered pages. @default true */
  serveAssets?: boolean;
  /** Module with a default native Bun.WebSocketHandler export. */
  websocket?: string;
}

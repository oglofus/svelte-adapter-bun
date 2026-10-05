# Examples

## Available Examples

- [Demo](./demo/) - Full SvelteKit application
- [WebSocket](./websocket/) - WebSocket server example
- [Nginx](./nginx/) - Production deployment with Nginx reverse proxy

## Quick Start

Each example is an independent project with its own lockfile. Build the local
adapter archive first so the example tests the actual package contents:

```bash
bun install --frozen-lockfile
bun run pack
bun run example:install [example-name]
cd examples/[example-name]
bun run check
bun run build
bun run start
```

After repacking, run `bun run example:install [example-name]` from the root again.
It refreshes only the adapter dependency and its archive integrity in the
example's lockfile. A plain install can reuse a stale cached archive in Bun 1.4.2.

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
cd examples/[example-name]
bun install --frozen-lockfile
bun run check
bun run build
bun run start
```

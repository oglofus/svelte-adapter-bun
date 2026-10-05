# Native Bun WebSocket example

Uses SvelteKit 3 with a native `Bun.WebSocketHandler`, without a WebSocket library or generated-code patches.

- `vite.config.ts`: configures `adapter()`.
- `src/hooks.server.ts`: exports `websocket` alongside `handle`, checks `/ws`, and calls `event.platform.upgrade`.
- `src/routes/+page.svelte`: connects with the browser's native WebSocket.

The hook returns a placeholder 204 after a successful upgrade. The adapter discards it and Bun sends the 101 response. Authenticate requests and validate their Origin **before** upgrading.

## Run

From the repository root:

```sh
bun install --frozen-lockfile
bun run pack
bun run example:install websocket
cd examples/websocket
bun run check
bun run build
bun run start
```

Open `http://localhost:3000`. The server sends a greeting and echoes messages.

`bun run dev` provides SvelteKit's normal Vite development server but does **not** run the adapter's Bun WebSocket server. Test WebSockets against the production build.

Install `@types/bun` for Bun types in your app. Importing `@oglofus/svelte-adapter-bun` supplies the adapter's `App.Platform` declaration; avoid redeclaring conflicting platform fields.

Existing hooks using `platform.server.upgrade(platform.request)` and returning a status-101 placeholder remain compatible. Kit 3's `Handle` type is imported from `@sveltejs/kit/hooks`.

For per-connection state, pass `{ data: { userId } }` to `platform.upgrade` and type the handler with `Bun.WebSocketHandler<{ userId: string }>`. Read state from `ws.data`, not a second `open` callback argument.

See [Bun's native WebSocket documentation](https://bun.com/docs/runtime/http/websockets) for pub/sub, backpressure, and lifecycle options.

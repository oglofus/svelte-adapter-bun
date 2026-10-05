# @oglofus/svelte-adapter-bun

[![CI](https://github.com/oglofus/svelte-adapter-bun/actions/workflows/ci.yml/badge.svg)](https://github.com/oglofus/svelte-adapter-bun/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40oglofus%2Fsvelte-adapter-bun)](https://www.npmjs.com/package/@oglofus/svelte-adapter-bun)

A SvelteKit 3 adapter that generates a Bun server. Uses SvelteKit's public adapter APIs and required Vite build pipeline, with native `Bun.serve`, `Bun.file`, and Bun WebSockets at runtime. No separate bundler, static-server dependency, Node adapter, or patches to SvelteKit internals.

Maintained under [Oglofus](https://github.com/oglofus/svelte-adapter-bun) and published to npm as **`@oglofus/svelte-adapter-bun`**. Based on [Volodymyr Palamar's original adapter](https://github.com/gornostay25/svelte-adapter-bun).

## Requirements

- Bun **1.4.2 or newer**
- SvelteKit **3**, Svelte **5.57.1 or newer**
- Vite **8** and `@sveltejs/vite-plugin-svelte` **7**
- For TypeScript apps, TypeScript **6** (the version supported by Kit 3)

## Usage

```sh
bun add -d @oglofus/svelte-adapter-bun @types/bun
```

SvelteKit 3 configuration belongs in `vite.config.ts`, not `svelte.config.js`:

```ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@oglofus/svelte-adapter-bun';

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
});
```

Use `"build": "bun --bun run vite build"` in your app's scripts. The `--bun` flag ensures SvelteKit's tooling also runs in Bun rather than following a Node shebang.

```sh
bun run build
bun build/index.js
```

Deploy the **whole** output directory, including `server`, `adapter-bun.js`, `client`, and `prerendered`. Production dependencies referenced by your app remain external: install them with `bun install --production --frozen-lockfile` on the deployment target. Development dependencies required by the server are bundled by SvelteKit.

## Adapter options

```ts
adapter({
  out: 'build',
  precompress: true,
  serveAssets: true,
  envPrefix: '',
  // websocket: './src/websocket.ts',
});
```

| Option        | Default | Purpose                                                                                                       |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `out`         | `build` | Output directory; removed and recreated during adaptation                                                     |
| `precompress` | `true`  | Generate gzip and brotli variants through SvelteKit                                                           |
| `serveAssets` | `true`  | Serve client assets and prerendered pages; set false for an external static server                            |
| `envPrefix`   | `''`    | Prefix deployment settings, e.g. `APP_PORT`                                                                   |
| `websocket`   | unset   | Optional override module with a default `Bun.WebSocketHandler`; otherwise loads `websocket` from server hooks |

Static serving supports GET/HEAD, conditional requests, single byte ranges, precompressed representations, immutable asset caching, base paths, and prerendered trailing-slash redirects.

## Deployment environment

Bun loads `.env` files natively; no dotenv library is needed.

| Variable          | Default                               | Purpose                                                                  |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `HOST`            | `0.0.0.0`                             | TCP bind address                                                         |
| `PORT`            | `3000`                                | TCP port; `0` chooses an available port                                  |
| `SOCKET_PATH`     | unset                                 | Unix socket instead of TCP                                               |
| `ORIGIN`          | Kit `paths.origin`, or request origin | Public origin, e.g. `https://example.com`                                |
| `PROTOCOL_HEADER` | unset                                 | Trusted proxy protocol header                                            |
| `HOST_HEADER`     | unset                                 | Trusted proxy host header                                                |
| `PORT_HEADER`     | unset                                 | Trusted proxy port header                                                |
| `ADDRESS_HEADER`  | unset                                 | Trusted proxy client-address header; otherwise uses `server.requestIP()` |
| `XFF_DEPTH`       | `1`                                   | Positive trusted proxy count, read from the right of `x-forwarded-for`   |
| `BODY_SIZE_LIMIT` | `512K`                                | Bytes or a `B`, `K`, `M`, `G` suffix; `0` rejects nonempty bodies        |
| `IDLE_TIMEOUT`    | `10`                                  | TCP idle timeout in seconds, integer 0–255; 0 disables it                |

Only configure forwarding headers behind a trusted proxy that strips or overwrites client-supplied values. For Unix sockets, configure `ADDRESS_HEADER` if your app uses `event.getClientAddress()`.

```sh
HOST=127.0.0.1 PORT=4000 ORIGIN=https://example.com bun build/index.js
```

`envPrefix: 'APP_'` changes these settings to `APP_HOST`, `APP_PORT`, etc. Use a dedicated prefix; unknown prefixed deployment variables are rejected to catch configuration mistakes.

On SIGINT/SIGTERM, the server drains requests for up to 30 seconds, then force-closes remaining connections and emits `sveltekit:shutdown`. SvelteKit's server instrumentation runs before application startup, including its environment initializer.

## Native WebSockets

Keep the `websocket` export alongside `handle` in `hooks.server.ts`. This adapter convention is backwards compatible; the handler is passed directly to `Bun.serve` and built in SvelteKit's shared server module graph, without patches to Kit's generated code. Custom `files.hooks.server` locations are supported.

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
  if (
    event.url.pathname === '/ws' &&
    event.request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  ) {
    // Check session, Origin, and permissions here.
    if (event.platform?.upgrade({ data: undefined })) {
      return new Response(null, { status: 204 });
    }
    return new Response('Upgrade failed', { status: 400 });
  }
  return resolve(event);
};

export const websocket: Bun.WebSocketHandler<undefined> = {
  message(ws, message) {
    ws.send(message);
  },
};
```

`platform.upgrade` calls `server.upgrade` with the original Bun request. Bun sends the 101 response itself; the adapter discards the hook's placeholder response and returns `undefined` to Bun.

Existing hooks using `await event.platform.server.upgrade(event.platform.request)` and returning `new Response(null, { status: 101 })` also continue to work: the adapter tracks that native upgrade and discards the placeholder. New code can use `platform.upgrade` and a 204 placeholder. Check the upgrade boolean so failures still produce an HTTP response.

For a separate module, set `websocket: './src/websocket.ts'` and default-export the native handler. No additional library is needed.

Adapter WebSockets are available in the **built Bun server**, not Vite's dev/preview server. See [the WebSocket example](examples/websocket/README.md).

## Migration from 1.x

If you previously installed the unscoped package, replace it and update adapter imports:

```sh
bun remove svelte-adapter-bun
bun add -d @oglofus/svelte-adapter-bun @types/bun
```

This is a breaking toolchain update: Kit 2 is no longer supported. Move config into `sveltekit({...})` in Vite config and follow the [Kit 3 migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3). Kit 3 exports `Handle` from `@sveltejs/kit/hooks`; the `websocket` export and existing platform upgrade pattern remain compatible.

## Developing this adapter

```sh
bun install --frozen-lockfile
bun run build
bun run check
bun test
```

To install an example using the freshly packed adapter:

```sh
bun run pack
bun run example:install websocket # or demo / nginx
cd examples/websocket
bun run check
bun run build
bun run start
```

After adapter changes, repack and rerun `example:install` from the root. This
refreshes only the local adapter dependency and its lockfile integrity; Bun 1.4.2
can otherwise reuse a stale cached tarball even with `bun install --force`.

Tests use `bun:test`, including production-server integration tests. Examples are independent projects with separate lockfiles, not workspaces. Run `bun run pack` in the root first; each example installs the resulting local `svelte-adapter-bun.tgz`, avoiding recursive directory copies and testing the published package contents. Then install/check/build the example with Bun. Repack and reinstall the archive after adapter changes. Prettier is a development-only formatter.

CI tests the minimum supported Bun version and the latest stable Bun release. It also installs the packed scoped package into each example and runs its type checks and production build.

## Publishing to npm

The [release workflow](.github/workflows/release-package.yml) uses Bun to install, type-check, test, build, pack, and publish the package with public access. It runs when a **non-prerelease GitHub release is published**; prereleases are skipped so they cannot replace npm's `latest` tag.

One-time setup for repository maintainers:

1. Ensure your npm account has permission to publish packages under the `@oglofus` organization.
2. Create an npm **granular access token** with read/write permission for this package (or the scope for the first publication). Enable **bypass 2FA** for automated publishing if required by your npm settings, and set an appropriate expiration.
3. Save the token as the **`NPM_TOKEN`** GitHub Actions repository secret in [Settings → Secrets and variables → Actions](https://github.com/oglofus/svelte-adapter-bun/settings/secrets/actions). Never commit the token.

For each release:

1. Set a new, unpublished `version` in `package.json`, commit the changes, and push them to GitHub.
2. Wait for CI to pass on that commit.
3. Create and publish a GitHub release targeting that commit with a tag matching the package version, e.g. `v1.0.1` for `1.0.1`. The workflow rejects mismatched tags.

To inspect the package locally **without publishing**:

```sh
bun run pack
NPM_CONFIG_TOKEN=dry-run-placeholder bun publish --dry-run ./svelte-adapter-bun.tgz
```

Bun 1.4.2 requires a token value even for a dry run. The placeholder above is not a credential and is only suitable with `--dry-run`; no package is uploaded.

Bun authenticates with `NPM_CONFIG_TOKEN`, which the workflow supplies from `NPM_TOKEN`. Bun 1.4.2 does not support npm provenance or npm's OIDC trusted-publisher flow, so this Bun-only workflow deliberately does not request `id-token: write` or pass `--provenance`. Token authentication is required; rotate the secret before its token expires.

## License

[MIT](LICENSE) © [Volodymyr Palamar](https://github.com/gornostay25)

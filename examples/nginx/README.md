# Nginx Example

Production deployment setup with Nginx reverse proxy for `@oglofus/svelte-adapter-bun`.
Use Bun 1.4.2.

## Docker Quick Start

From this example directory:

```sh
docker compose -f docker/docker-compose.yml up --build
```

Visit `http://app.localhost`. The supplied configuration uses HTTP and sets
`ORIGIN=http://app.localhost`; TLS requires your own certificates and configuration.

The app image builds and packs the local adapter from the repository root before
installing this independent example. The repository-root build context is required
by the example's `file:../../svelte-adapter-bun.tgz` dependency.

```sh
docker compose -f docker/docker-compose.yml down
```

## Local Build

Build the adapter first, starting in the repository root:

```sh
bun install --frozen-lockfile
bun run pack
bun run example:install nginx
cd examples/nginx
bun --bun run check
bun --bun run build
```

## Build and Deployment Layout

- `serveAssets: false`: Nginx serves static assets; the Bun server handles SSR.
- SvelteKit's Vite build and the adapter produce `build/index.js`, `build/client`
  and `build/prerendered`. There is no second server bundling step.
- The packaging script adds `build/entrypoint.sh`. At startup it replaces the
  shared volume's `client` and `prerendered` directories with the current build.
- Nginx mounts that volume read-only and serves assets and prerendered pages
  (including gzip files), forwarding other requests to Bun.
- Immutable assets receive long-lived caching; a maintenance page is returned
  when the backend is unavailable.

For a direct SSR-only smoke test (static files will not be served):

```sh
ORIGIN=http://localhost:3000 bun --bun run ./build/index.js
```

## Production Notes

- Add TLS listeners and mount certificates in `docker/nginx.conf`.
- Update `server_name` and the Compose `ORIGIN` together for your public URL.
- Consider load balancing for high traffic.

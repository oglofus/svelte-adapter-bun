# SvelteKit Demo App

This is a demo app for SvelteKit. It is a simple app that demonstrates the use of `@oglofus/svelte-adapter-bun`.

Use Bun 1.4.2. From the repository root, install and pack the local adapter first:

```sh
bun install --frozen-lockfile
bun run pack
bun run example:install demo
cd examples/demo
```

## Running the app

```sh
bun --bun run dev
```

## Building the app

```sh
bun --bun run build
```

## Running the built app

```sh
bun --bun run ./build/index.js
```

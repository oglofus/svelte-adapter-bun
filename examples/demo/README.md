# SvelteKit Demo App

This is a demo app for SvelteKit. It is a simple app that demonstrates the use of svelte-adapter-bun.

Use Bun 1.4.2. From the repository root, install and pack the local adapter first:

```sh
bun install
bun run pack
cd examples/demo
bun install
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

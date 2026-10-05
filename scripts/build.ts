import { version } from '../package.json';

console.log(`Building svelte-adapter-bun v${version}...`);

for (const config of [
  {
    entrypoints: ['./index.ts'],
    outdir: 'dist',
    packages: 'external' as const,
  },
  {
    entrypoints: [
      './src/index.ts',
      './src/handler.ts',
      './src/env.ts',
      './src/options.ts',
      './src/static.ts',
    ],
    outdir: 'dist/files',
    // Leave local imports for SvelteKit's single SSR build graph.
    external: ['./*', 'svelte-adapter-bun:manifest', 'WEBSOCKET'],
  },
]) {
  const result = await Bun.build({ ...config, target: 'bun', format: 'esm' });
  if (!result.success)
    throw new AggregateError(result.logs, 'Adapter build failed');
}

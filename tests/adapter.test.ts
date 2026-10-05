import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import adapter from '../index';

function plugin(hook: string, extensions = ['.js', '.ts']) {
  const vite = adapter().vite;
  if (typeof vite !== 'function')
    throw new Error('Expected adapter Vite configuration');
  const config = vite({
    config: {
      files: { hooks: { server: hook } },
      moduleExtensions: extensions,
    } as never,
  });
  if (!config.plugins || Array.isArray(config.plugins))
    throw new Error('Expected post plugins');
  return config.plugins.post![0] as Plugin;
}

test('native SSR bundling respects noExternal: true and dependency matches', async () => {
  const cwd = process.cwd();
  const directory = `${import.meta.dir}/../.cache/adapter-config-${crypto.randomUUID()}`;
  await Bun.write(
    `${directory}/package.json`,
    JSON.stringify({ dependencies: { native: '1', library: '1' } })
  );
  try {
    process.chdir(directory);
    const hook = plugin('unused').config;
    if (typeof hook !== 'function') throw new Error('Expected config hook');
    for (const [noExternal, expected] of [
      [true, []],
      [['native'], ['library']],
      ['native', ['library']],
      [[/^lib/], ['native']],
      [/^lib/, ['native']],
      [undefined, ['native', 'library']],
    ] as const) {
      const config = await hook.call(
        {} as never,
        { ssr: { noExternal } } as never,
        {} as never
      );
      expect(config?.ssr?.external).toEqual([...expected]);
    }
    const config = await hook.call(
      {} as never,
      {
        environments: { ssr: { resolve: { noExternal: true } } },
      } as never,
      {} as never
    );
    expect(config?.ssr?.external).toEqual([]);
  } finally {
    process.chdir(cwd);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('hook lookup supports configured extensions and directory index modules', async () => {
  const directory = `${import.meta.dir}/../.cache/adapter-hooks-${crypto.randomUUID()}`;
  try {
    await Bun.write(
      `${directory}/hooks/index.mjs`,
      'export const websocket = {};'
    );
    const hooks = plugin(`${directory}/hooks`, ['.mjs']);
    if (typeof hooks.load !== 'function') throw new Error('Expected load hook');
    const code = await hooks.load.call(
      {} as never,
      '\0svelte-adapter-bun:websocket'
    );
    expect(code).toContain(resolve(directory, 'hooks/index.mjs'));
    expect(code).toContain("Reflect.get(hooks, 'websocket')");
    const missing = plugin(`${directory}/missing`);
    if (typeof missing.load !== 'function')
      throw new Error('Expected load hook');
    expect(
      await missing.load.call({} as never, '\0svelte-adapter-bun:websocket')
    ).toBe('export default undefined;');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

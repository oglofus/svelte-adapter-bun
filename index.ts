import type { Adapter } from '@sveltejs/kit';
import type { AdapterOptions } from './options.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';

const files = fileURLToPath(new URL('./files', import.meta.url)).replaceAll(
  '\\',
  '/'
);
const handoff = 'svelte-adapter-bun:manifest';
const websocketModule = '\0svelte-adapter-bun:websocket';

export default function adapter(options: AdapterOptions = {}): Adapter {
  const {
    out = 'build',
    precompress = true,
    envPrefix = '',
    serveAssets = true,
  } = options;

  return {
    name: 'svelte-adapter-bun',
    async adapt(builder) {
      if (typeof Bun === 'undefined') {
        throw new Error(
          'svelte-adapter-bun requires Bun. Run `bun --bun run build`.'
        );
      }
      rmSync(out, { force: true, recursive: true });
      builder.log.minor('Copying assets');
      const base = builder.config.paths.base;
      builder.writeClient(`${out}/client${base}`);
      const prerenderedFiles = builder.writePrerendered(
        `${out}/prerendered${base}`
      );
      const pageFiles = new Set(
        [...builder.prerendered.pages.values()].map(page => page.file)
      );
      const prefix = (file: string) =>
        `${base.slice(1)}${base ? '/' : ''}${file}`;
      if (precompress) {
        await Promise.all([
          builder.compress(`${out}/client`),
          builder.compress(`${out}/prerendered`),
        ]);
      }

      const server = builder.getServerDirectory();
      builder.generateServerInstance(`${server}/server.js`);
      const manifestFile = resolve(server, '../adapter-bun.js');
      await Bun.write(
        manifestFile,
        [
          `export { server } from './server/server.js';`,
          `export const base = ${JSON.stringify(base)};`,
          `export const appDir = ${JSON.stringify(builder.config.appDir)};`,
          `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
          `export const prerenderedPages = new Map(${JSON.stringify([...builder.prerendered.pages].map(([path, page]) => [path, prefix(page.file)]))});`,
          `export const prerenderedAssets = new Set(${JSON.stringify(prerenderedFiles.filter(file => !pageFiles.has(file)).map(prefix))});`,
          `export const prerenderedTypes = new Map(${JSON.stringify([...builder.prerendered.assets].map(([path, asset]) => [path, asset.type]))});`,
          `export const redirects = new Map(${JSON.stringify([...builder.prerendered.redirects])});`,
          `export const envPrefix = ${JSON.stringify(envPrefix)};`,
          `export const serveAssets = ${serveAssets};`,
          `export const origin = ${JSON.stringify(builder.config.paths.origin)};`,
        ].join('\n')
      );

      if (builder.hasServerInstrumentationFile()) {
        builder.instrument({
          entrypoint: `${server}/adapter-index.js`,
          instrumentation: `${server}/instrumentation.server.js`,
          initializer: builder.createInstrumentationInitializer({
            outputDirectory: server,
          }),
          module: { exports: ['path', 'host', 'port', 'server'] },
        });
      }
      builder.copy(server, `${out}/server`);
      builder.copy(manifestFile, `${out}/adapter-bun.js`);
      await Bun.write(
        `${out}/index.js`,
        `export { path, host, port, server } from './server/adapter-index.js';\n`
      );
    },
    supports: { read: () => true, instrumentation: () => true },
    vite: ({ config: kitConfig }) => ({
      plugins: {
        post: [
          {
            name: 'svelte-adapter-bun',
            apply: 'build',
            resolveId(id) {
              if (id === 'WEBSOCKET') return websocketModule;
            },
            async load(id) {
              if (id === websocketModule) {
                if (options.websocket) {
                  return `export { default } from ${JSON.stringify(resolve(options.websocket))};`;
                }
                const hook = kitConfig.files.hooks.server;
                const candidates = [
                  hook,
                  ...kitConfig.moduleExtensions.map(
                    extension => `${hook}/index${extension}`
                  ),
                  ...kitConfig.moduleExtensions.map(
                    extension => hook + extension
                  ),
                ];
                for (const candidate of candidates) {
                  if (await Bun.file(candidate).exists()) {
                    // Namespace access preserves the optional export without requiring
                    // a websocket handler in apps that only export standard Kit hooks.
                    return `import * as hooks from ${JSON.stringify(resolve(candidate))};
                    export default Reflect.get(hooks, 'websocket');`;
                  }
                }
                return 'export default undefined;';
              }
            },
            async config(config) {
              const pkg = await Bun.file('package.json').json();
              const setting =
                config.environments?.ssr?.resolve?.noExternal ??
                config.ssr?.noExternal;
              const noExternal = Array.isArray(setting)
                ? setting
                : typeof setting === 'string' || setting instanceof RegExp
                  ? [setting]
                  : [];
              return {
                ssr: {
                  noExternal: true,
                  external:
                    setting === true
                      ? []
                      : Object.keys(pkg.dependencies ?? {}).filter(
                          dep =>
                            !noExternal.some(rule =>
                              typeof rule === 'string'
                                ? rule === dep
                                : rule.test(dep)
                            )
                        ),
                },
                environments: {
                  ssr: {
                    build: {
                      rolldownOptions: {
                        input: { 'adapter-index': `${files}/index.js` },
                        external: [handoff],
                        output: {
                          paths: { [handoff]: '../adapter-bun.js' },
                          chunkFileNames: chunk =>
                            chunk.moduleIds.some(id => id.startsWith(files))
                              ? 'adapter-bun-[name].js'
                              : 'chunks/[name].js',
                        },
                      },
                    },
                  },
                },
              };
            },
          },
        ],
      },
    }),
  };
}

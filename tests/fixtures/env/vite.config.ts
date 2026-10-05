import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '../../../dist/index.js';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ envPrefix: 'ADAPTER_' }),
      files: {
        hooks: {
          server: process.env.FIXTURE_WEBSOCKET
            ? 'src/hooks-websocket'
            : 'src/hooks-standard',
        },
      },
    }),
  ],
});

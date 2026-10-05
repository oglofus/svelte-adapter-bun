import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '../../../dist/index.js';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({
        envPrefix: 'ADAPTER_',
        ...(process.env.FIXTURE_EXTERNAL_ASSETS === '1'
          ? { serveAssets: false, precompress: false }
          : {}),
      }),
      paths: { base: '/base' },
    }),
  ],
});

import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@oglofus/svelte-adapter-bun';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ serveAssets: false }),
      preprocess: vitePreprocess(),
    }),
  ],
});

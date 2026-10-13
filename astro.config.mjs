import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { unified } from '@astrojs/markdown-remark';
import { rehypeGate } from './src/lib/rehype-gate.mjs';

export default defineConfig({
  site: 'https://cacao-media.vercel.app',
  trailingSlash: 'always',
  // Pages are static. Only the routes that sign or check tokens (src/pages/api) run on the server.
  adapter: vercel(),
  markdown: {
    // 'quitar': the text after <!-- gate --> is left out of the page. See scripts/cerrado.mjs.
    processor: unified({ rehypePlugins: [[rehypeGate, { modo: 'quitar' }]] }),
  },
});

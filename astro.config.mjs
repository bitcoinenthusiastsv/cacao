import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { unified } from '@astrojs/markdown-remark';
import { rehypeGate } from './src/lib/rehype-gate.mjs';

export default defineConfig({
  site: 'https://cacao-media.vercel.app',
  trailingSlash: 'always',
  // Pages are static. Only the routes that sign or check tokens (src/pages/api) run on the server.
  adapter: vercel(),
  vite: {
    server: {
      // The other sites and scratch folders live in this repository too. A file written there
      // (a screenshot, a build) must not reload this site while someone is using it.
      watch: { ignored: ['**/.qa/**', '**/market/**', '**/pay/**', '**/ledger/**', '**/travel/**'] },
    },
  },
  markdown: {
    // 'quitar': the text after <!-- gate --> is left out of the page. See scripts/cerrado.mjs.
    processor: unified({ rehypePlugins: [[rehypeGate, { modo: 'quitar' }]] }),
  },
});

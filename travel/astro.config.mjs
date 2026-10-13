import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://cacao-travel.vercel.app',
  trailingSlash: 'always',
  // Pages are static. Only the booking and reader-discount routes run on the server.
  adapter: vercel(),
});

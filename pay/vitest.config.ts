import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests live next to the code in src/lib. Server modules import 'server-only', which the
// test run replaces with an empty module.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'server-only': fileURLToPath(new URL('./tests/vacio.ts', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 20000,
  },
});

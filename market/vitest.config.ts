import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests live next to the code in src/lib; database tests in tests/db talk to the local Supabase.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'server-only': fileURLToPath(new URL('./tests/vacio.ts', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/db/**/*.test.ts'],
    // Database tests share one database: run files one after another.
    fileParallelism: false,
    testTimeout: 20000,
  },
});

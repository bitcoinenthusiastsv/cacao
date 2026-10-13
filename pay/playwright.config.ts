import { defineConfig } from '@playwright/test';

// End-to-end tests run against the dev server that is already up on port 4324. They share one local
// database and the nine test phones, so they run one at a time.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PAY_URL ?? 'http://localhost:4324',
    // Phone first: the product is used on a phone.
    viewport: { width: 375, height: 800 },
    locale: 'es-SV',
    timezoneId: 'America/El_Salvador',
    trace: 'retain-on-failure',
  },
  outputDir: './.qa/e2e-resultados',
});

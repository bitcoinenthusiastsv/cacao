import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

// A missing or invalid product id must return HTTP 404, not 200 with the not-found page streamed in.

test('producto inexistente responde 404', async ({ page }) => {
  const respuesta = await page.goto(`/productos/${randomUUID()}`);
  expect(respuesta?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Esta página no existe.' })).toBeVisible();
});

test('producto con id mal formado responde 404', async ({ page }) => {
  const respuesta = await page.goto('/productos/no-es-un-uuid');
  expect(respuesta?.status()).toBe(404);
});

test('servicio inexistente responde 404', async ({ page }) => {
  const respuesta = await page.goto(`/servicios/${randomUUID()}`);
  expect(respuesta?.status()).toBe(404);
});

test('servicio con id mal formado responde 404', async ({ page }) => {
  const respuesta = await page.goto('/servicios/123');
  expect(respuesta?.status()).toBe(404);
});

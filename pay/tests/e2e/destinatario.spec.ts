import { expect, test } from '@playwright/test';

import { crearEnvioDb, sesionDe } from './ayuda';

test('un envío a Rosa aparece en "Dinero que te mandaron" sin la comisión y se abre', async ({ browser }) => {
  // Rosa's registered phone, typed the way the sender types it.
  const { id } = await crearEnvioDb({
    remitente: 'lucia',
    nombre: 'Mamá Rosa',
    contacto: '+503 7000 0002',
    nota: 'Para el mercado del jueves',
  });
  const rosa = await sesionDe(browser, 'rosa');
  try {
    await rosa.goto('/recibidos');
    const tarjeta = rosa.locator(`a[href="/recibidos/${id}"]`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta).toContainText('Te mandó Lucía');
    await expect(tarjeta).toContainText('$96.51');
    // The recipient never sees the fee, on the list or in the card's text.
    await expect(tarjeta).not.toContainText('Comisión');
    await expect(tarjeta).not.toContainText('$3.49');

    await tarjeta.click();
    await rosa.waitForURL(`**/recibidos/${id}`);
    await expect(rosa.getByRole('heading', { level: 1 })).toHaveText('Mamá, te mandaron dinero');
    await expect(rosa.getByRole('region', { name: 'Vas a recibir' }).getByText('$96.51', { exact: true })).toBeVisible();
    await expect(rosa.getByText('Para el mercado del jueves')).toBeVisible();

    const html = await rosa.content();
    expect(html).not.toContain('$3.49');
    expect(html).not.toContain('Comisión');
  } finally {
    await rosa.context().close();
  }
});

test('el envío de otra persona no se abre desde Recibidos: sale la página de no encontrado', async ({ browser }) => {
  // Sent by Lucía to someone else, so Rosa is neither the sender nor the recipient.
  const { id } = await crearEnvioDb({ remitente: 'lucia', nombre: 'Marta Hernández', contacto: '+503 7612 3456' });
  const rosa = await sesionDe(browser, 'rosa');
  try {
    const respuesta = await rosa.goto(`/recibidos/${id}`);
    expect(respuesta?.status()).toBe(404);
    await expect(rosa.getByRole('heading', { name: 'No encontramos ese envío' })).toBeVisible();
    await expect(rosa.getByText('Marta Hernández')).toHaveCount(0);
  } finally {
    await rosa.context().close();
  }
});

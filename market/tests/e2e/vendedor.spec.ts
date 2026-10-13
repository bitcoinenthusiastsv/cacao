
import { expect, test } from '@playwright/test';

import { idDe, type Persona, servicio, sesionDe } from './ayuda';

// A buyer without a shop, if one of the candidates still has none.
async function compradoraSinTienda(): Promise<Persona | null> {
  for (const persona of ['andres', 'lucia'] as const) {
    const { data, error } = await servicio()
      .from('negocios')
      .select('id')
      .eq('usuario_id', await idDe(persona))
      .maybeSingle();
    if (error) throw error;
    if (data === null) return persona;
  }
  return null;
}

// The shop of one persona, if it has one.
async function negocioDe(persona: Persona): Promise<{ id: string; estado: string } | null> {
  const { data, error } = await servicio()
    .from('negocios')
    .select('id, estado')
    .eq('usuario_id', await idDe(persona))
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; estado: string } | null;
}

test('vendedora nueva: solicita, la admin aprueba, publica un producto y aparece en el inicio', async ({
  browser,
}) => {
  const candidata = await compradoraSinTienda();
  test.skip(
    candidata === null,
    'Andrés y Lucía ya tienen negocio (el test anterior lo dejó suspendido). Hace falta reseedear la base.',
  );
  if (candidata === null) return;

  const sufijo = Date.now();
  const nombreNegocio = `Granja Prueba Vendedor ${sufijo}`;
  const nombreProducto = `Miel de prueba ${sufijo}`;
  let negocioId: string | null = null;

  const nueva = await sesionDe(browser, candidata);
  const admin = await sesionDe(browser, 'ana');
  try {
    // Buyer without a shop applies.
    await nueva.goto('/mi-negocio');
    await nueva.waitForLoadState('networkidle');
    await expect(nueva.getByRole('heading', { name: 'Vendé en CacaoMarket' })).toBeVisible();
    await nueva.getByLabel('Nombre del negocio', { exact: true }).fill(nombreNegocio);
    await nueva.getByLabel('Descripción', { exact: true }).fill('Granja de prueba para el test de vendedor.');
    await nueva.getByLabel('Ubicación', { exact: true }).fill('Ahuachapán');
    await nueva.getByLabel('Lightning Address', { exact: true }).fill('vendedora.prueba@ejemplo.sv');
    await nueva.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(nueva.getByText('Tu solicitud está en revisión')).toBeVisible();
    negocioId = (await negocioDe(candidata))?.id ?? null;

    // Admin approves the shop.
    await admin.goto('/admin/negocios');
    await admin.waitForLoadState('networkidle');
    const tarjeta = admin
      .getByRole('article')
      .filter({ has: admin.getByRole('heading', { name: nombreNegocio, exact: true }) });
    await expect(tarjeta).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Aprobar' }).click();
    await expect
      .poll(async () => (await negocioDe(candidata))?.estado ?? null)
      .toBe('aprobado');

    // The new seller sees the approved shop and publishes a product.
    await nueva.goto('/mi-negocio');
    await nueva.waitForLoadState('networkidle');
    await expect(nueva.getByText('Aprobado', { exact: true })).toBeVisible();

    await nueva.goto('/mi-negocio/productos/nuevo');
    await nueva.waitForLoadState('networkidle');
    await nueva.getByLabel('Nombre del producto', { exact: true }).fill(nombreProducto);
    await nueva.getByLabel('Categoría', { exact: true }).selectOption({ index: 1 });
    await nueva.getByLabel('Unidad de venta', { exact: true }).fill('frasco');
    await nueva.getByLabel('Precio en dólares (USD)', { exact: true }).fill('4.25');
    await nueva.getByLabel('Stock disponible', { exact: true }).fill('6');
    await nueva.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(nueva).toHaveURL(/\/mi-negocio\/productos\?guardado=1/);
    await expect(nueva.getByText('Guardamos el producto.')).toBeVisible();

    // The product shows in the public catalogue.
    await nueva.goto(`/?q=${encodeURIComponent(nombreProducto)}`);
    await nueva.waitForLoadState('networkidle');
    await expect(nueva.getByText(nombreProducto, { exact: true }).first()).toBeVisible();
  } finally {
    // Puts the shop back to suspended so it does not stay in the catalogue.
    if (negocioId !== null) {
      const { error } = await servicio().rpc('cambiar_estado_negocio', {
        p_negocio: negocioId,
        p_actor: await idDe('ana'),
        p_estado: 'suspendido',
      });
      if (error) throw new Error(`No pude suspender el negocio de prueba: ${error.message}`);
    }
    await nueva.context().close();
    await admin.context().close();
  }
});

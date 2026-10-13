import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { idDe, servicio, sesionDe } from './ayuda';

// One visitor walks the purchase: product, cart, order, payment screen, payment. Each funnel step gains
// exactly one session, and the funnel page shows the steps.

const PASOS = ['vista_producto', 'agrego_carrito', 'inicio_pedido', 'vio_pago', 'pago'] as const;

type Paso = { nombre: string; sesiones: number };

// The funnel for a window around this run. Counts distinct sessions per step.
async function embudo(desde: string, hasta: string): Promise<Map<string, number>> {
  const { data, error } = await servicio().rpc('embudo', { p_sitio: 'market', p_desde: desde, p_hasta: hasta });
  if (error) throw error;
  return new Map((data as Paso[]).map((p) => [p.nombre, Number(p.sesiones)]));
}

async function productoDe(vendedor: 'rosa', stock: number, nombre: string) {
  const usuario = await idDe(vendedor);
  const { data: categoria, error: errorCategoria } = await servicio()
    .from('categorias')
    .select('id')
    .order('id')
    .limit(1)
    .single();
  if (errorCategoria) throw errorCategoria;
  const { data, error } = await servicio().rpc('guardar_producto', {
    p_usuario: usuario,
    p_producto: null,
    p_categoria: categoria.id,
    p_nombre: nombre,
    p_descripcion: 'Producto de prueba del embudo.',
    p_unidad: 'libra',
    p_precio: 350,
    p_stock: stock,
    p_activo: true,
    p_fotos: [],
  });
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

// Waits for the browser to report one funnel event. The page posts it after it shows.
function eventoEnviado(pagina: Page, nombre: string) {
  return pagina.waitForResponse(
    (r) => r.url().includes('/api/evento') && r.request().postDataJSON()?.nombre === nombre && r.status() === 204,
    { timeout: 30_000 },
  );
}

test('cada paso del embudo suma una sesión, y el panel de administración lo muestra', async ({ browser }) => {
  const producto = await productoDe('rosa', 10, `Cacao de prueba embudo ${Date.now()}`);
  const desde = new Date(Date.now() - 60_000).toISOString();
  const hasta = new Date(Date.now() + 24 * 3600_000).toISOString();
  const antes = await embudo(desde, hasta);

  // A visit that starts with a new session: the cookie of earlier runs is removed, so every step is new.
  const lucia = await sesionDe(browser, 'lucia');
  const contexto = lucia.context();
  await contexto.clearCookies({ name: 'cm_sesion' });
  const ana = await sesionDe(browser, 'ana');

  try {
    // Walking view: the product page posts the first event.
    const vista = eventoEnviado(lucia, 'vista_producto');
    await lucia.goto(`/productos/${producto.id}`);
    await vista;

    // Add to cart: only a successful add counts.
    const agrego = eventoEnviado(lucia, 'agrego_carrito');
    await lucia.getByRole('button', { name: 'Agregar al carrito' }).click();
    await agrego;

    // Order: the server records the order when it is placed.
    await lucia.goto('/carrito');
    await lucia.waitForLoadState('networkidle');
    await lucia.getByRole('button', { name: 'Hacer pedido' }).click();
    await expect(lucia).toHaveURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/);
    const ordenId = /\/ordenes\/([0-9a-f-]{36})/.exec(lucia.url())?.[1] ?? '';
    expect(ordenId).toMatch(/^[0-9a-f-]{36}$/);

    // Payment screen opened: recorded by the server while the page renders.
    await expect(lucia.getByRole('button', { name: 'Simular pago' })).toBeVisible();

    // Payment: the server records it when the payment is confirmed.
    await lucia.getByRole('button', { name: 'Simular pago' }).click();
    await expect(lucia).toHaveURL(new RegExp(`/ordenes/${ordenId}$`), { timeout: 60_000 });

    const despues = await embudo(desde, hasta);
    for (const nombre of PASOS) {
      expect(despues.get(nombre) ?? 0, `paso ${nombre}`).toBe((antes.get(nombre) ?? 0) + 1);
    }

    // The funnel page, as the administrator: every step, in order, and the sentence under it.
    await ana.goto('/admin/embudo');
    await ana.waitForLoadState('networkidle');
    await expect(ana.getByRole('heading', { name: 'Embudo de compra' })).toBeVisible();
    for (const etiqueta of [
      'Vio un producto',
      'Agregó al carrito',
      'Hizo el pedido',
      'Abrió la pantalla de pago',
      'Pagó',
    ]) {
      await expect(ana.getByText(etiqueta, { exact: true })).toBeVisible();
    }
    await expect(ana.getByText(/^De cada 100 personas que ven un producto, \d+ pagan\.$/)).toBeVisible();
    await expect(ana.getByRole('link', { name: 'Embudo' })).toBeVisible();
  } finally {
    await lucia.context().close();
    await ana.context().close();
  }
});

test('el embudo rechaza fechas que no existen y vuelve a los últimos 30 días', async ({ browser }) => {
  const ana = await sesionDe(browser, 'ana');
  try {
    await ana.goto('/admin/embudo?desde=2026-02-30&hasta=2026-10-13');
    // The route announcer is also a live region: match the page's own message by its text.
    await expect(ana.locator('p[role="alert"]')).toContainText('no es válida');
    await expect(ana.getByRole('heading', { name: 'Embudo de compra' })).toBeVisible();
  } finally {
    await ana.context().close();
  }
});

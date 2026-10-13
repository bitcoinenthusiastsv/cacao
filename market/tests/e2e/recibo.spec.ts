import { expect, test } from '@playwright/test';

import { idDe, servicio, sesionDe } from './ayuda';

// The receipt of a paid order: the buyer and the shop see it, a stranger does not, and an unpaid order
// goes back to the order.

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
    p_descripcion: 'Producto de prueba del comprobante.',
    p_unidad: 'libra',
    p_precio: 350,
    p_stock: stock,
    p_activo: true,
    p_fotos: [],
  });
  if (error) throw new Error(error.message);
  return { id: data.id as string, negocioId: data.negocio_id as string };
}

function ordenDeUrl(url: string): string {
  const coincidencia = /\/ordenes\/([0-9a-f-]{36})/i.exec(url);
  if (!coincidencia) throw new Error(`La URL no tiene una orden: ${url}`);
  return coincidencia[1];
}

// Adds units of one product to the cart and places the order. Leaves the page on the payment screen.
async function pedirProducto(
  pagina: import('@playwright/test').Page,
  productoId: string,
  cantidad: number,
): Promise<string> {
  await pagina.goto(`/productos/${productoId}`);
  await pagina.waitForLoadState('networkidle');
  if (cantidad > 1) {
    await pagina.getByRole('button', { name: 'Sumar una unidad' }).click();
  }
  await pagina.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(pagina.getByRole('status').filter({ hasText: 'Listo: agregaste' })).toBeVisible();
  await pagina.goto('/carrito');
  await pagina.waitForLoadState('networkidle');
  await pagina.getByRole('button', { name: 'Hacer pedido' }).click();
  await expect(pagina).toHaveURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/);
  return ordenDeUrl(pagina.url());
}

test('el comprobante de una orden pagada: totales, partes y el aviso; un extraño no lo ve', async ({ browser }) => {
  const producto = await productoDe('rosa', 10, `Cacao de prueba comprobante ${Date.now()}`);
  const { data: negocio, error: errorNegocio } = await servicio()
    .from('negocios')
    .select('nombre')
    .eq('id', producto.negocioId)
    .single();
  if (errorNegocio) throw errorNegocio;

  const comprador = await sesionDe(browser, 'lucia');
  const extrano = await sesionDe(browser, 'diego');
  try {
    // Two units at $3.50: the receipt totals $7.00.
    const ordenId = await pedirProducto(comprador, producto.id, 2);
    await comprador.getByRole('button', { name: 'Simular pago' }).click();
    await expect(comprador).toHaveURL(new RegExp(`/ordenes/${ordenId}$`), { timeout: 60_000 });

    // The order page links to the receipt once the order is paid.
    await comprador.getByRole('link', { name: 'Ver comprobante' }).click();
    await expect(comprador).toHaveURL(new RegExp(`/ordenes/${ordenId}/recibo$`));
    // Scoped to the receipt: the page's other headings and the route announcer also say "Orden N".
    const recibo = comprador.getByRole('article', { name: 'Comprobante de pago' });
    await expect(recibo.getByRole('heading', { name: 'Comprobante de pago' })).toBeVisible();
    await expect(recibo.getByText(/^Orden \d+$/)).toBeVisible();
    await expect(recibo.getByText('Bitcoin por Lightning, pago simulado')).toBeVisible();
    await expect(recibo.getByText(/^1 BTC = \$[\d,]+\.\d{2}$/)).toBeVisible();
    await expect(recibo.getByText(negocio.nombre, { exact: true })).toBeVisible();
    await expect(recibo.getByText('Lucía', { exact: false }).first()).toBeVisible();
    await expect(recibo.getByText('2 × $3.50 por libra')).toBeVisible();
    await expect(recibo.getByText(/^\$7\.00 · [\d,]+ sats$/).last()).toBeVisible();
    await expect(
      recibo.getByText('Este comprobante no es un documento tributario. La factura electrónica (DTE) la emite el vendedor.'),
    ).toBeVisible();

    // Printing shows the receipt alone: the button and the navigation are hidden.
    await comprador.emulateMedia({ media: 'print' });
    await expect(comprador.getByRole('button', { name: 'Imprimir o guardar como PDF' })).toBeHidden();
    await expect(recibo.getByRole('heading', { name: 'Comprobante de pago' })).toBeVisible();
    await comprador.emulateMedia({ media: 'screen' });

    // A stranger who is signed in gets the same answer as for a missing order.
    await extrano.goto(`/ordenes/${ordenId}/recibo`);
    await expect(extrano.getByRole('heading', { name: 'Esta página no existe.' })).toBeVisible({ timeout: 30_000 });
    await expect(extrano.getByRole('heading', { name: 'Comprobante de pago' })).toHaveCount(0);
  } finally {
    await comprador.context().close();
    await extrano.context().close();
  }
});

test('una orden sin pagar no tiene comprobante: vuelve a la orden', async ({ browser }) => {
  const producto = await productoDe('rosa', 5, `Cacao sin pagar comprobante ${Date.now()}`);
  const comprador = await sesionDe(browser, 'lucia');
  try {
    const ordenId = await pedirProducto(comprador, producto.id, 1);
    // Not paid: the receipt address leads back to the order.
    await comprador.goto(`/ordenes/${ordenId}/recibo`);
    await expect(comprador).toHaveURL(new RegExp(`/ordenes/${ordenId}$`));
    await expect(comprador.getByRole('heading', { name: 'Comprobante de pago' })).toHaveCount(0);
    await expect(comprador.getByRole('link', { name: 'Ver comprobante' })).toHaveCount(0);
  } finally {
    await comprador.context().close();
  }
});

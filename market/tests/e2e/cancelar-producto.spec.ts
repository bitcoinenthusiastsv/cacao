import { expect, test } from '@playwright/test';

import { idDe, servicio, sesionDe } from './ayuda';

// The buyer cancels an unpaid product order from the payment screen. The stock comes back, the payment
// screen stops, and a payment that arrives later is refused.

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
    p_descripcion: 'Producto de prueba de la cancelación.',
    p_unidad: 'libra',
    p_precio: 350,
    p_stock: stock,
    p_activo: true,
    p_fotos: [],
  });
  if (error) throw new Error(error.message);
  return { id: data.id as string, negocioId: data.negocio_id as string };
}

async function stockDe(productoId: string): Promise<number> {
  const { data, error } = await servicio().from('productos').select('stock').eq('id', productoId).single();
  if (error) throw error;
  return data.stock as number;
}

function ordenDeUrl(url: string): string {
  const coincidencia = /\/ordenes\/([0-9a-f-]{36})/i.exec(url);
  if (!coincidencia) throw new Error(`La URL no tiene una orden: ${url}`);
  return coincidencia[1];
}

test('el comprador cancela el pedido antes de pagar: stock de vuelta, sin pago posible', async ({ browser }) => {
  const producto = await productoDe('rosa', 4, `Cacao de prueba cancelación ${Date.now()}`);
  const motivo = `Cambié de idea, ya no lo necesito ${Date.now()}.`;
  const comprador = await sesionDe(browser, 'lucia');
  const vendedora = await sesionDe(browser, 'rosa');

  try {
    // The buyer orders one unit from the cart: the order waits for payment.
    await comprador.goto(`/productos/${producto.id}`);
    await comprador.waitForLoadState('networkidle');
    await comprador.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(comprador.getByText('Listo: agregaste 1 unidad al carrito.')).toBeVisible();

    await comprador.goto('/carrito');
    await comprador.waitForLoadState('networkidle');
    await comprador.getByRole('button', { name: 'Hacer pedido' }).click();
    await expect(comprador).toHaveURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/);
    const ordenId = ordenDeUrl(comprador.url());
    expect(await stockDe(producto.id)).toBe(3);

    // The cancel is behind a disclosure; the reason is required and the second step confirms it.
    await comprador.getByRole('button', { name: 'Cancelar pedido' }).click();
    await comprador.getByLabel('Motivo de la cancelación').fill(motivo);
    await comprador.getByRole('button', { name: 'Cancelar el pedido' }).click();
    await expect(comprador.getByText('¿Seguro que querés cancelar este pedido? No se puede deshacer.')).toBeVisible();
    await comprador.getByRole('button', { name: 'Sí, cancelar el pedido' }).click();

    // The payment screen stops: no invoice, no demo payment, and the cancelled sentence with the way back.
    await expect(comprador.getByText('Cancelaste este pedido. No pagués esta factura.')).toBeVisible({ timeout: 60_000 });
    await expect(comprador.getByRole('button', { name: 'Simular pago' })).toHaveCount(0);
    await expect(comprador.getByText(/Vence en \d+:\d{2}/)).toHaveCount(0);
    await expect(comprador.getByRole('link', { name: 'Volver al carrito' })).toBeVisible();

    // The order and the stock, from the database.
    const { data: orden, error } = await servicio().from('ordenes').select('estado, motivo_cancelacion').eq('id', ordenId).single();
    if (error) throw error;
    expect(orden.estado).toBe('cancelada');
    expect(orden.motivo_cancelacion).toBe(motivo);
    expect(await stockDe(producto.id)).toBe(4);

    // The order page for the buyer: cancelled, with the reason on the timeline.
    await comprador.goto(`/ordenes/${ordenId}`);
    await comprador.waitForLoadState('networkidle');
    await expect(comprador.getByText('Cancelaste este pedido. Los productos volvieron al inventario.')).toBeVisible();
    await expect(comprador.getByText(`Motivo: ${motivo}`)).toBeVisible();

    // The seller sees it in the history, with the sentence for the seller.
    await vendedora.goto('/mi-negocio/ordenes');
    await vendedora.waitForLoadState('networkidle');
    await expect(vendedora.getByRole('heading', { name: 'Historial' })).toBeVisible();
    await expect(vendedora.locator(`a[href="/ordenes/${ordenId}"]`)).toContainText('Cancelada');
    await vendedora.goto(`/ordenes/${ordenId}`);
    await vendedora.waitForLoadState('networkidle');
    await expect(vendedora.getByText('El comprador canceló este pedido antes de pagar.')).toBeVisible();

    // A payment that arrives after the cancel is refused by the database.
    const tarde = await servicio().rpc('confirmar_pago', { p_orden: ordenId, p_actor: null });
    expect(tarde.error?.message ?? '').toMatch(/^ESTADO_INVALIDO/);
    expect(await stockDe(producto.id)).toBe(4);

    // Reopening the payment screen still says so, and offers no way to pay.
    await comprador.goto(`/ordenes/${ordenId}/pagar`);
    await expect(comprador.getByText('Cancelaste este pedido. No pagués esta factura.')).toBeVisible();
    await expect(comprador.getByRole('button', { name: 'Simular pago' })).toHaveCount(0);
  } finally {
    await comprador.context().close();
    await vendedora.context().close();
  }
});

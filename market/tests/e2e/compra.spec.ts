
import { expect, test } from '@playwright/test';

import { idDe, servicio, sesionDe } from './ayuda';

// Creates a product of a seller through the database function, so each test owns its data.
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
    p_descripcion: 'Producto de prueba del test de compra.',
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

test('compra completa: pedido, pago simulado, entrega con código y reseña', async ({ browser }) => {
  const producto = await productoDe('rosa', 20, `Cacao de prueba compra ${Date.now()}`);
  const comentario = `Cacao fresco, llegó en buen estado ${Date.now()}.`;
  const comprador = await sesionDe(browser, 'lucia');
  const vendedora = await sesionDe(browser, 'rosa');

  try {
    // Buyer adds the product to the cart and places the order.
    await comprador.goto(`/productos/${producto.id}`);
    await comprador.waitForLoadState('networkidle');
    await comprador.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(comprador.getByText('Listo: agregaste 1 unidad al carrito.')).toBeVisible();

    await comprador.goto('/carrito');
    await comprador.waitForLoadState('networkidle');
    const pedir = comprador.getByRole('button', { name: 'Hacer pedido' });
    await expect(pedir).toBeEnabled();
    await pedir.click();
    await expect(comprador).toHaveURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/);
    const ordenId = ordenDeUrl(comprador.url());

    // Payment screen: amount in sats and USD, and a countdown.
    await expect(comprador.getByText('sats', { exact: true }).first()).toBeVisible();
    await expect(comprador.getByText(/^\$\d+\.\d{2}$/).first()).toBeVisible();
    await expect(comprador.getByText(/Vence en \d+:\d{2}/)).toBeVisible();

    await comprador.getByRole('button', { name: 'Simular pago' }).click();
    await expect(comprador).toHaveURL(new RegExp(`/ordenes/${ordenId}$`), { timeout: 30_000 });
    // The state description is unique to "pagada"; the timeline lists every step label.
    await expect(comprador.getByText('Pagaste. El vendedor está preparando tu pedido.')).toBeVisible();

    // The delivery code is read from the database; the buyer sees it in threes.
    const { data: orden, error } = await servicio()
      .from('ordenes')
      .select('codigo_entrega')
      .eq('id', ordenId)
      .single();
    if (error) throw error;
    const codigo = orden.codigo_entrega as string;
    expect(codigo).toMatch(/^\d{6}$/);
    const codigoPartido = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;
    await expect(comprador.getByRole('heading', { name: 'Código de entrega' })).toBeVisible();
    await expect(comprador.getByText(codigoPartido, { exact: true })).toBeVisible();

    // Seller opens the same order: the code must not be anywhere in the HTML.
    await vendedora.goto(`/ordenes/${ordenId}`);
    await vendedora.waitForLoadState('networkidle');
    const html = await vendedora.content();
    expect(html).not.toContain(codigo);
    expect(html).not.toContain(codigoPartido);
    await expect(vendedora.getByRole('heading', { name: 'Código de entrega' })).toHaveCount(0);

    // Seller marks the order ready. The delivery form only exists in state "lista".
    await vendedora.getByRole('button', { name: 'Marcar como lista' }).click();
    const confirmar = vendedora.getByRole('button', { name: 'Confirmar entrega' });
    await expect(confirmar).toBeVisible({ timeout: 60_000 });

    // A wrong code is refused. The dev server can be slow, so the server round-trip gets 60 s.
    const erroneo = codigo === '000000' ? '111111' : '000000';
    await vendedora.getByLabel('Código de entrega').fill(erroneo);
    await confirmar.click();
    await expect(vendedora.getByText('El código de entrega no coincide.')).toBeVisible({ timeout: 60_000 });

    // The right code delivers the order: the form goes away and the state reads "Entregada".
    await vendedora.getByLabel('Código de entrega').fill(codigo);
    await confirmar.click();
    await expect(confirmar).toHaveCount(0, { timeout: 60_000 });
    await expect(vendedora.getByText('El pedido fue entregado.', { exact: false })).toBeVisible({ timeout: 60_000 });

    // Buyer leaves a five-star review with a comment.
    await comprador.goto(`/ordenes/${ordenId}`);
    await comprador.waitForLoadState('networkidle');
    await comprador.getByLabel('5 estrellas').check();
    await comprador.getByLabel('Comentario (opcional)').fill(comentario);
    await comprador.getByRole('button', { name: 'Enviar reseña' }).click();
    // Exact names: "Dejá tu reseña" is the form heading and must not count as the saved review.
    const tuResena = comprador.getByRole('region', { name: 'Tu reseña', exact: true });
    await expect(tuResena).toBeVisible();
    await expect(tuResena.getByText(comentario, { exact: true })).toBeVisible();

    // The review also shows on the shop's public page.
    await comprador.goto(`/negocios/${producto.negocioId}`);
    const resenas = comprador.getByRole('region', { name: 'Reseñas', exact: true });
    await expect(resenas).toBeVisible();
    await expect(resenas.getByText(comentario, { exact: true })).toBeVisible();
  } finally {
    await comprador.context().close();
    await vendedora.context().close();
  }
});

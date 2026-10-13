import { randomUUID } from 'node:crypto';

import { expect, type Page, test } from '@playwright/test';

import { idDe, type Persona, seDesborda, servicio, sesionDe } from './ayuda';

const ANCHO_MINIMO = 320;

// Opens a route at 320 px and checks it has a heading and no sideways scroll.
async function sinDesbordeEn(pagina: Page, ruta: string) {
  const respuesta = await pagina.goto(ruta);
  expect(respuesta?.status(), `estado de ${ruta}`).toBeLessThan(400);
  await pagina.waitForLoadState('networkidle');
  await expect(pagina.locator('h1').first(), ruta).toBeVisible();
  expect(await seDesborda(pagina), `${ruta} tiene desplazamiento lateral`).toBe(false);
}

// Creates a product of a seller through the database function.
async function productoDe(vendedor: Persona, stock: number, nombre: string) {
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
    p_descripcion: 'Producto de prueba del test de móvil.',
    p_unidad: 'libra',
    p_precio: 350,
    p_stock: stock,
    p_activo: true,
    p_fotos: [],
  });
  if (error) throw new Error(error.message);
  return { id: data.id as string, negocioId: data.negocio_id as string };
}

// Arranges an order through the database functions: created with a payment request, and paid if asked.
async function ordenPorRpc(comprador: Persona, producto: { id: string; negocioId: string }, pagada: boolean) {
  const s = servicio();
  const { data: orden, error } = await s.rpc('crear_orden', {
    p_comprador: await idDe(comprador),
    p_negocio: producto.negocioId,
    p_lineas: [{ producto_id: producto.id, cantidad: 1 }],
    p_modo: 'recogida',
    p_clave: randomUUID(),
    p_cotizacion: 100000,
  });
  if (error) throw new Error(error.message);
  const { error: errorCobro } = await s.rpc('registrar_cobro', {
    p_orden: orden.id,
    p_proveedor: 'falso',
    p_referencia: null,
    p_bolt11: null,
    p_destino: null,
    p_verificar_url: null,
    p_expira_en: new Date(Date.now() + 600_000).toISOString(),
  });
  if (errorCobro) throw new Error(errorCobro.message);
  if (pagada) {
    const { error: errorPago } = await s.rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    if (errorPago) throw new Error(errorPago.message);
  }
  return orden.id as string;
}

test('compradora en 320 px: ninguna pantalla se desborda', async ({ browser }) => {
  const producto = await productoDe('rosa', 20, `Miel movil ${Date.now()}`);
  const pagada = await ordenPorRpc('lucia', producto, true);
  const pendiente = await ordenPorRpc('lucia', producto, false);
  const lucia = await sesionDe(browser, 'lucia');

  try {
    await lucia.setViewportSize({ width: ANCHO_MINIMO, height: 800 });
    await sinDesbordeEn(lucia, '/');
    await sinDesbordeEn(lucia, `/productos/${producto.id}`);
    await sinDesbordeEn(lucia, `/negocios/${producto.negocioId}`);

    // Cart with one item, then the order, which opens the payment screen.
    await lucia.goto(`/productos/${producto.id}`);
    await lucia.waitForLoadState('networkidle');
    await lucia.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(lucia.getByText('Listo: agregaste')).toBeVisible();
    await lucia.goto('/carrito');
    await lucia.waitForLoadState('networkidle');
    const pedir = lucia.getByRole('button', { name: 'Hacer pedido' });
    await expect(pedir).toBeEnabled();
    expect(await seDesborda(lucia), '/carrito con un producto').toBe(false);
    await pedir.click();
    await expect(lucia).toHaveURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/);
    await expect(lucia.locator('h1').first()).toBeVisible();
    expect(await seDesborda(lucia), 'pantalla de pago recién creada').toBe(false);

    await sinDesbordeEn(lucia, '/ordenes');
    await sinDesbordeEn(lucia, `/ordenes/${pagada}`);
    await sinDesbordeEn(lucia, `/ordenes/${pendiente}/pagar`);
    await sinDesbordeEn(lucia, '/cuenta');
  } finally {
    await lucia.context().close();
  }
});

test('vendedora en 320 px: ninguna pantalla del negocio se desborda', async ({ browser }) => {
  const rosa = await sesionDe(browser, 'rosa');

  try {
    await rosa.setViewportSize({ width: ANCHO_MINIMO, height: 800 });
    await sinDesbordeEn(rosa, '/mi-negocio');
    await sinDesbordeEn(rosa, '/mi-negocio/productos');
    await sinDesbordeEn(rosa, '/mi-negocio/productos/nuevo');
    await sinDesbordeEn(rosa, '/mi-negocio/ordenes');
  } finally {
    await rosa.context().close();
  }
});

test('administradora en 320 px: ninguna pantalla de administración se desborda', async ({ browser }) => {
  const admin = await sesionDe(browser, 'ana');

  try {
    await admin.setViewportSize({ width: ANCHO_MINIMO, height: 800 });
    for (const ruta of ['/admin', '/admin/negocios', '/admin/ordenes', '/admin/disputas', '/admin/auditoria']) {
      await sinDesbordeEn(admin, ruta);
    }
  } finally {
    await admin.context().close();
  }
});

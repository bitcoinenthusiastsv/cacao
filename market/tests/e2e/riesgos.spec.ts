import { randomUUID } from 'node:crypto';

import { expect, type Page, test } from '@playwright/test';

import { idDe, OPCIONES_CONTEXTO, type Persona, servicio, sesionDe } from './ayuda';

// Creates a product of a seller through the database function, with the given stock.
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
    p_descripcion: 'Producto de prueba de riesgos.',
    p_unidad: 'libra',
    p_precio: 350,
    p_stock: stock,
    p_activo: true,
    p_fotos: [],
  });
  if (error) throw new Error(error.message);
  return { id: data.id as string, negocioId: data.negocio_id as string, nombre };
}

async function negocioDe(vendedor: Persona) {
  const { data, error } = await servicio()
    .from('negocios')
    .select('id, tipo_proveedor_pago, lightning_address')
    .eq('usuario_id', await idDe(vendedor))
    .single();
  if (error) throw error;
  return data as { id: string; tipo_proveedor_pago: string; lightning_address: string | null };
}

async function stockDe(productoId: string): Promise<number> {
  const { data, error } = await servicio().from('productos').select('stock').eq('id', productoId).single();
  if (error) throw error;
  return data.stock as number;
}

// Orders that hold this product. The product is created by the test, so other people's orders do
// not count, even when they use the same test phone at the same time.
async function pedidosDelProducto(productoId: string): Promise<number> {
  const { count, error } = await servicio()
    .from('lineas_orden')
    .select('id', { count: 'exact', head: true })
    .eq('producto_id', productoId);
  if (error) throw error;
  return count ?? 0;
}

// Adds one unit to the cart from the product page.
async function agregarAlCarrito(pagina: Page, productoId: string) {
  await pagina.goto(`/productos/${productoId}`);
  await pagina.waitForLoadState('networkidle');
  await pagina.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(pagina.getByText('Listo: agregaste')).toBeVisible();
}

// Opens the cart and returns the "Hacer pedido" button once it can be pressed.
async function irAlCarrito(pagina: Page) {
  await pagina.goto('/carrito');
  await pagina.waitForLoadState('networkidle');
  const boton = pagina.getByRole('button', { name: 'Hacer pedido' });
  await expect(boton).toBeEnabled();
  return boton;
}

function ordenDeUrl(url: string): string {
  const coincidencia = /\/ordenes\/([0-9a-f-]{36})/i.exec(url);
  if (!coincidencia) throw new Error(`La URL no tiene una orden: ${url}`);
  return coincidencia[1];
}

// Arranges an order through the database functions, with its payment request still open.
async function ordenPendientePorRpc(comprador: Persona, producto: { id: string; negocioId: string }) {
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
  return orden.id as string;
}

// Riesgo 1: two buyers ask for the last unit at the same moment.
test('dos compradores piden la última unidad: solo uno recibe orden', async ({ browser }) => {
  const producto = await productoDe('rosa', 1, `Ultima unidad ${Date.now()}`);
  const lucia = await sesionDe(browser, 'lucia');
  const andres = await sesionDe(browser, 'andres');

  try {
    await agregarAlCarrito(lucia, producto.id);
    await agregarAlCarrito(andres, producto.id);
    const pedirLucia = await irAlCarrito(lucia);
    const pedirAndres = await irAlCarrito(andres);

    await Promise.all([pedirLucia.click(), pedirAndres.click()]);

    // Exactly one of them reaches the payment screen.
    const ganadora = await Promise.race([
      lucia.waitForURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/, { timeout: 30_000 }).then(() => 'lucia' as const),
      andres.waitForURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/, { timeout: 30_000 }).then(() => 'andres' as const),
    ]);
    const perdedora = ganadora === 'lucia' ? andres : lucia;

    // The other one stays on the cart and sees the no-stock message.
    await expect(perdedora).toHaveURL(/\/carrito$/);
    await expect(perdedora.getByText(/Ya no quedan suficientes unidades/)).toBeVisible();

    // Stock is zero, never negative, and only one order holds the product.
    expect(await stockDe(producto.id)).toBe(0);
    const { count, error } = await servicio()
      .from('lineas_orden')
      .select('id', { count: 'exact', head: true })
      .eq('producto_id', producto.id);
    if (error) throw error;
    expect(count).toBe(1);
  } finally {
    await lucia.context().close();
    await andres.context().close();
  }
});

// Riesgo 2: a double tap on "Hacer pedido" creates one order.
for (const gesto of ['doble toque', 'dos clics seguidos'] as const) {
  test(`${gesto} en "Hacer pedido" crea una sola orden`, async ({ browser }) => {
    const producto = await productoDe('rosa', 10, `Doble toque ${Date.now()}`);
    const lucia = await sesionDe(browser, 'lucia');

    try {
      await agregarAlCarrito(lucia, producto.id);
      const pedir = await irAlCarrito(lucia);
      const antes = await pedidosDelProducto(producto.id);

      if (gesto === 'doble toque') {
        await pedir.dblclick();
      } else {
        // Two clicks in the same task: the second one lands before React re-renders the button.
        await pedir.evaluate((boton) => {
          (boton as HTMLButtonElement).click();
          (boton as HTMLButtonElement).click();
        });
      }
      await expect(lucia).toHaveURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/);

      // The count must reach one order and stay there.
      await expect.poll(() => pedidosDelProducto(producto.id), { timeout: 10_000 }).toBe(antes + 1);
      // No fixed wait has a web-first equivalent here: give a second request time to land.
      await lucia.waitForTimeout(2_000);
      expect(await pedidosDelProducto(producto.id)).toBe(antes + 1);
    } finally {
      await lucia.context().close();
    }
  });
}

// Riesgo 3: the payment request expires while the buyer is on the payment screen.
test('el pago vence con la pantalla abierta: se avisa, no se puede pagar y el stock vuelve', async ({ browser }) => {
  const producto = await productoDe('rosa', 3, `Vence en pantalla ${Date.now()}`);
  const stockAntes = await stockDe(producto.id);
  const lucia = await sesionDe(browser, 'lucia');

  try {
    await agregarAlCarrito(lucia, producto.id);
    const pedir = await irAlCarrito(lucia);
    await pedir.click();
    await expect(lucia).toHaveURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/);
    const ordenId = ordenDeUrl(lucia.url());
    await expect(lucia.getByRole('button', { name: 'Simular pago' })).toBeVisible();
    expect(await stockDe(producto.id)).toBe(stockAntes - 1);

    // Move the deadline of this request into the past, with the service role.
    const { error } = await servicio()
      .from('cobros')
      .update({ expira_en: new Date(Date.now() - 60_000).toISOString() })
      .eq('orden_id', ordenId);
    if (error) throw error;

    // The screen says the time ran out, within the polling interval.
    await expect(lucia.getByText('El tiempo para pagar se acabó', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(lucia.getByRole('button', { name: 'Simular pago' })).toHaveCount(0);
    await expect(lucia.getByRole('button', { name: 'Copiar factura' })).toHaveCount(0);
    await expect(lucia.getByRole('link', { name: 'Volver al carrito' })).toBeVisible();

    // The order is expired and the stock is back.
    const { data: orden, error: errorOrden } = await servicio()
      .from('ordenes')
      .select('estado')
      .eq('id', ordenId)
      .single();
    if (errorOrden) throw errorOrden;
    expect(orden.estado).toBe('expirada');
    expect(await stockDe(producto.id)).toBe(stockAntes);

    // Paying late does not mark the order paid.
    const { error: errorPagoTardio } = await servicio().rpc('confirmar_pago', {
      p_orden: ordenId,
      p_actor: null,
    });
    expect(errorPagoTardio).not.toBeNull();
    const { data: despues } = await servicio().from('ordenes').select('estado').eq('id', ordenId).single();
    expect(despues?.estado).toBe('expirada');
  } finally {
    await lucia.context().close();
  }
});

// Riesgo 4: the seller's Lightning Address points at an internal or unusable target. The server
// must not hang or reach private networks. The database refuses "nadie@localhost" (no dot in the
// domain), so these addresses are the closest ones it accepts.
const DIRECCIONES_INTERNAS = [
  'cobro@mirouter.local',
  'usuario@10.0.0.1.nip.io',
  'cobro@red.lan',
  'cobro@no-existe-cacao.invalid',
];

for (const direccion of DIRECCIONES_INTERNAS) {
  test(`dirección Lightning ${direccion}: la pantalla de pago responde a tiempo, sin fallar`, async ({ browser }) => {
    const original = await negocioDe('rosa');
    try {
      const { error: errorCambio } = await servicio()
        .from('negocios')
        .update({ tipo_proveedor_pago: 'manual', lightning_address: direccion })
        .eq('id', original.id);
      if (errorCambio) throw errorCambio;

      const producto = await productoDe('rosa', 5, `Direccion ${Date.now()}`);
      const lucia = await sesionDe(browser, 'lucia');
      try {
        await agregarAlCarrito(lucia, producto.id);
        const pedir = await irAlCarrito(lucia);

        const inicio = Date.now();
        await pedir.click();
        await expect(lucia).toHaveURL(/\/ordenes\/[0-9a-f-]{36}\/pagar$/, { timeout: 15_000 });
        console.log(`[${direccion}] llegó a la pantalla de pago en ${Date.now() - inicio} ms`);

        // Either the payable request (address and exact amount) or a clear Spanish error.
        const pagable = lucia.getByRole('heading', { name: 'Pagá a la dirección del vendedor' });
        const aviso = lucia.getByRole('main').getByRole('alert');
        await expect(pagable.or(aviso)).toBeVisible({ timeout: 15_000 });
        expect(Date.now() - inicio).toBeLessThan(15_000);
        await expect(lucia.getByText('Application error')).toHaveCount(0);

        if (await pagable.isVisible()) {
          const ordenId = ordenDeUrl(lucia.url());
          const { data: orden, error } = await servicio().from('ordenes').select('total_sats').eq('id', ordenId).single();
          if (error) throw error;
          await expect(lucia.getByLabel('Dirección Lightning')).toHaveValue(direccion);
          await expect(lucia.getByLabel('Monto en sats')).toHaveValue(String(orden.total_sats));
        } else {
          const texto = (await aviso.first().innerText()).trim();
          expect(texto).toMatch(/[a-záéíóúñ]/i);
          expect(texto).not.toMatch(/error|exception|undefined/i);
        }
      } finally {
        await lucia.context().close();
      }
    } finally {
      const { error } = await servicio()
        .from('negocios')
        .update({ tipo_proveedor_pago: original.tipo_proveedor_pago, lightning_address: original.lightning_address })
        .eq('id', original.id);
      if (error) throw new Error(`No pude restaurar el negocio de prueba: ${error.message}`);
    }
  });
}

// Riesgo 5: guessing URLs of other people's orders, chats, disputes and products.
test('URLs ajenas dicen "Esta página no existe" y no muestran datos', async ({ browser }) => {
  const producto = await productoDe('rosa', 5, `Ajena ${Date.now()}`);
  const ordenId = await ordenPendientePorRpc('lucia', producto);
  const diego = await sesionDe(browser, 'diego');

  try {
    for (const ruta of [`/ordenes/${ordenId}`, `/ordenes/${ordenId}/pagar`]) {
      await diego.goto(ruta);
      await expect(diego.getByText('Esta página no existe.')).toBeVisible();
      const texto = await diego.locator('body').innerText();
      expect(texto, ruta).not.toContain(producto.nombre);
      expect(texto, ruta).not.toContain('Productos y total');
    }
    // Diego has no shop, so the seller area sends him to the application page instead.
    await diego.goto(`/mi-negocio/productos/${producto.id}`);
    await expect(diego).toHaveURL(/\/mi-negocio$/);
    await expect(diego.locator('body')).not.toContainText(producto.nombre);
  } finally {
    await diego.context().close();
  }

  // Another seller, with a shop of his own, guesses the id of Rosa's product.
  const mario = await sesionDe(browser, 'mario');
  try {
    await mario.goto(`/mi-negocio/productos/${producto.id}`);
    await expect(mario.getByText('Esta página no existe.')).toBeVisible();
    await expect(mario.locator('body')).not.toContainText(producto.nombre);
  } finally {
    await mario.context().close();
  }

  // A buyer (not admin) gets a real 404 on the admin area.
  const lucia = await sesionDe(browser, 'lucia');
  try {
    for (const ruta of ['/admin', '/admin/disputas']) {
      const respuesta = await lucia.goto(ruta);
      expect(respuesta?.status(), ruta).toBe(404);
    }
  } finally {
    await lucia.context().close();
  }

  // Signed out, the private areas send the visitor to sign in.
  const anonima = await browser.newContext(OPCIONES_CONTEXTO);
  try {
    const pagina = await anonima.newPage();
    for (const ruta of ['/ordenes', '/mi-negocio', '/admin', '/cuenta']) {
      await pagina.goto(ruta);
      await expect(pagina, ruta).toHaveURL(/\/entrar/);
    }
  } finally {
    await anonima.close();
  }
});

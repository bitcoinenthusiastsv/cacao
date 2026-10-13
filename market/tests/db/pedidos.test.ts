import { afterAll, describe, expect, it } from 'vitest';
import { auditoriaDe, avisosDe, codigoDe, COTIZACION, negocio, ordenDe, pagar, pedir, pedirRaw, producto, servicio, stockDe, usuarioNuevo, limpiar } from './ayuda';

// Order cycle, stock and money rules, run against the real functions.

afterAll(limpiar);

describe('ciclo completo de una orden', () => {
  it('va de creada a cerrada, con estados, marcas de tiempo, stock, avisos y auditoría', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { precio: 350, stock: 5 });

    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 2 }]);
    expect(orden.estado).toBe('creada');
    expect(orden.total_usd_centavos).toBe(700);
    expect(orden.total_sats).toBe(7000);
    expect(await stockDe(prod.id)).toBe(3);

    const cobro = await s.rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: 'ciclo-1',
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 600_000).toISOString(),
    });
    expect(cobro.error).toBeNull();
    expect((await ordenDe(orden.id)).estado).toBe('esperando_pago');

    const confirmada = await s.rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    expect(confirmada.error).toBeNull();
    expect(confirmada.data.estado).toBe('pagada');
    const trasPago = await ordenDe(orden.id);
    expect(trasPago.pagada_en).not.toBeNull();
    expect(trasPago.codigo_entrega).toMatch(/^\d{6}$/);

    const lista = await s.rpc('marcar_lista', { p_orden: orden.id, p_actor: vendedor.id });
    expect(lista.error).toBeNull();
    expect(lista.data.estado).toBe('lista');
    expect((await ordenDe(orden.id)).lista_en).not.toBeNull();

    const entregada = await s.rpc('marcar_entregada', {
      p_orden: orden.id,
      p_actor: vendedor.id,
      p_codigo: trasPago.codigo_entrega,
    });
    expect(entregada.error).toBeNull();
    expect(entregada.data.estado).toBe('entregada');
    expect((await ordenDe(orden.id)).entregada_en).not.toBeNull();

    const resena = await s.rpc('crear_resena', {
      p_orden: orden.id,
      p_actor: comprador.id,
      p_puntuacion: 5,
      p_comentario: 'Todo bien',
    });
    expect(resena.error).toBeNull();
    const cerrada = await ordenDe(orden.id);
    expect(cerrada.estado).toBe('cerrada');
    expect(cerrada.cerrada_en).not.toBeNull();

    // One notice per step, for the other party: the buyer hears from the system and the seller; the
    // seller's steps reach the buyer; the buyer's review reaches the seller.
    const avisos = await avisosDe(orden.id);
    const delComprador = avisos.filter((a) => a.usuario_id === comprador.id).map((a) => a.tipo).sort();
    const delVendedor = avisos.filter((a) => a.usuario_id === vendedor.id).map((a) => a.tipo).sort();
    expect(delComprador).toEqual(
      ['orden.entregada', 'orden.esperando_pago', 'orden.lista', 'orden.pagada'].sort(),
    );
    // The system confirmed the payment, so the shop owner is told too; the review closes the order.
    expect(delVendedor).toEqual(['orden.cerrada', 'orden.pagada']);

    const auditoria = (await auditoriaDe(orden.id)).map((a) => a.accion);
    expect(auditoria).toEqual([
      'orden.creada',
      'orden.esperando_pago',
      'orden.pagada',
      'orden.lista',
      'orden.entregada',
      'orden.cerrada',
    ]);
    expect(await stockDe(prod.id)).toBe(3);
  });
});

describe('conversión a sats', () => {
  it('350 centavos a cotización 100000 son 3500 sats', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { precio: 350, stock: 1 });

    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }], { cotizacion: 100000 });
    expect(orden.total_sats).toBe(3500);
    expect(Number(orden.cotizacion_usd_btc)).toBe(100000);
  });

  it('1 centavo a cotización 97000 redondea hacia arriba (11 sats)', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { precio: 1, stock: 1 });

    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }], { cotizacion: 97000 });
    expect(orden.total_sats).toBe(11);
  });

  it('calcula la comisión teórica con la tasa en puntos básicos', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { precio: 350, stock: 1 });

    // 1% of 3500 sats is 35 sats.
    const { data, error } = await servicio().rpc('crear_orden', {
      p_comprador: comprador.id,
      p_negocio: tienda,
      p_lineas: [{ producto_id: prod.id, cantidad: 1 }],
      p_modo: 'recogida',
      p_clave: 'comision-1',
      p_cotizacion: COTIZACION,
      p_comision_bps: 100,
    });
    expect(error).toBeNull();
    expect(data.comision_teorica_sats).toBe(35);
  });
});

describe('stock bajo carrera', () => {
  it('dos pedidos simultáneos por la última unidad: uno gana, el otro recibe SIN_STOCK', async () => {
    const vendedor = await usuarioNuevo();
    const primero = await usuarioNuevo();
    const segundo = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 1 });

    const [a, b] = await Promise.all([
      pedirRaw(primero, tienda, [{ producto: prod.id, cantidad: 1 }]),
      pedirRaw(segundo, tienda, [{ producto: prod.id, cantidad: 1 }]),
    ]);

    const ganadores = [a, b].filter((r) => r.error === null);
    const perdedores = [a, b].filter((r) => r.error !== null);
    expect(ganadores).toHaveLength(1);
    expect(perdedores).toHaveLength(1);
    expect(codigoDe(perdedores[0].error)).toBe('SIN_STOCK');
    expect(await stockDe(prod.id)).toBe(0);
  });

  it('nunca deja el stock en negativo con varios pedidos a la vez', async () => {
    const vendedor = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 3 });
    const compradores = await Promise.all([1, 2, 3, 4, 5].map(() => usuarioNuevo()));

    const resultados = await Promise.all(
      compradores.map((c) => pedirRaw(c, tienda, [{ producto: prod.id, cantidad: 1 }])),
    );

    expect(resultados.filter((r) => r.error === null)).toHaveLength(3);
    expect(resultados.filter((r) => codigoDe(r.error) === 'SIN_STOCK')).toHaveLength(2);
    expect(await stockDe(prod.id)).toBe(0);
  });
});

describe('idempotencia', () => {
  it('la misma clave dos veces devuelve la misma orden y descuenta el stock una sola vez', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 10 });

    const primera = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 4 }], { clave: 'carrito-1' });
    const segunda = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 4 }], { clave: 'carrito-1' });

    expect(segunda.id).toBe(primera.id);
    expect(segunda.numero).toBe(primera.numero);
    expect(await stockDe(prod.id)).toBe(6);
  });

  it('dos toques casi simultáneos con la misma clave crean una sola orden', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 10 });

    const [a, b] = await Promise.all([
      pedirRaw(comprador, tienda, [{ producto: prod.id, cantidad: 2 }], { clave: 'doble-toque' }),
      pedirRaw(comprador, tienda, [{ producto: prod.id, cantidad: 2 }], { clave: 'doble-toque' }),
    ]);

    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data.id).toBe(b.data.id);
    expect(await stockDe(prod.id)).toBe(8);
  });
});

describe('vencimiento del cobro', () => {
  it('expirar_ordenes devuelve el stock y la orden expirada no se puede pagar', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 10 });

    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 3 }]);
    expect(await stockDe(prod.id)).toBe(7);

    const cobro = await s.rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: 'vencido-1',
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(cobro.error).toBeNull();

    const expiradas = await s.rpc('expirar_ordenes');
    expect(expiradas.error).toBeNull();
    expect(expiradas.data).toBeGreaterThanOrEqual(1);

    const expirada = await ordenDe(orden.id);
    expect(expirada.estado).toBe('expirada');
    expect(expirada.expirada_en).not.toBeNull();
    expect(await stockDe(prod.id)).toBe(10);

    const { data: cobros } = await s.from('cobros').select('estado').eq('orden_id', orden.id);
    expect(cobros?.[0].estado).toBe('expirado');

    const tarde = await s.rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    expect(codigoDe(tarde.error)).toBe('ESTADO_INVALIDO');
    expect((await ordenDe(orden.id)).estado).toBe('expirada');
  });

  it('pagar después del vencimiento falla con FUERA_DE_PLAZO y la orden no queda pagada', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 10 });

    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await s.rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: 'tarde-1',
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() - 1_000).toISOString(),
    });

    // The request is past its deadline but expirar_ordenes has not run yet.
    const tarde = await s.rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    expect(codigoDe(tarde.error)).toBe('FUERA_DE_PLAZO');

    const despues = await ordenDe(orden.id);
    expect(despues.estado).toBe('esperando_pago');
    expect(despues.pagada_en).toBeNull();
    expect(despues.codigo_entrega).toBeNull();
  });
});

describe('código de entrega', () => {
  it('el vendedor con código incorrecto recibe CODIGO_INCORRECTO; el comprador entrega sin código', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 10 });

    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    const pagada = await pagar(orden.id);
    await s.rpc('marcar_lista', { p_orden: orden.id, p_actor: vendedor.id });

    const codigoFalso = pagada.codigo_entrega === '999999' ? '000000' : '999999';
    const mal = await s.rpc('marcar_entregada', { p_orden: orden.id, p_actor: vendedor.id, p_codigo: codigoFalso });
    expect(codigoDe(mal.error)).toBe('CODIGO_INCORRECTO');
    expect((await ordenDe(orden.id)).estado).toBe('lista');

    const sinCodigo = await s.rpc('marcar_entregada', { p_orden: orden.id, p_actor: vendedor.id, p_codigo: null });
    expect(codigoDe(sinCodigo.error)).toBe('CODIGO_INCORRECTO');

    // The buyer does not need the code.
    const porComprador = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await pagar(porComprador.id);
    await s.rpc('marcar_lista', { p_orden: porComprador.id, p_actor: vendedor.id });
    const entregadaPorComprador = await s.rpc('marcar_entregada', {
      p_orden: porComprador.id,
      p_actor: comprador.id,
      p_codigo: null,
    });
    expect(entregadaPorComprador.error).toBeNull();
    expect(entregadaPorComprador.data.estado).toBe('entregada');

    // Right code by the seller, after the wrong attempts.
    const bien = await s.rpc('marcar_entregada', {
      p_orden: orden.id,
      p_actor: vendedor.id,
      p_codigo: pagada.codigo_entrega,
    });
    expect(bien.error).toBeNull();
    expect(bien.data.estado).toBe('entregada');
  });
});

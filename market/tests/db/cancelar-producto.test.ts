import { afterAll, describe, expect, it } from 'vitest';
import {
  anonimo,
  avisosDe,
  codigoDe,
  contratar,
  fila,
  limpiar,
  negocio,
  ordenDe,
  pagar,
  pedir,
  producto,
  servicio,
  servicioDe,
  sesionDe,
  stockDe,
  sufijo,
  usuarioNuevo,
} from './ayuda';

// Cancelling an order: a buyer cancels a product order before it is paid (stock back, payment request
// closed, later payment refused), and the service cancel that already existed still works.

afterAll(limpiar);

function cancelarRaw(orden: string, actor: string, motivo = 'Cambié de idea.') {
  return servicio().rpc('cancelar_orden', { p_orden: orden, p_actor: actor, p_motivo: motivo });
}

describe('el comprador cancela un pedido de productos', () => {
  it('una orden creada pasa a cancelada, devuelve el stock y avisa solo al vendedor', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 2 }]);
    expect(await stockDe(prod.id)).toBe(3);

    const cancelada = await cancelarRaw(orden.id, comprador.id, 'Cambié de idea.');
    expect(cancelada.error).toBeNull();
    expect(cancelada.data.estado).toBe('cancelada');
    expect(cancelada.data.cancelada_en).not.toBeNull();
    expect(cancelada.data.motivo_cancelacion).toBe('Cambié de idea.');
    expect(await stockDe(prod.id)).toBe(5);

    const avisos = await avisosDe(orden.id);
    const delVendedor = avisos.filter((a) => a.usuario_id === vendedor.id && a.tipo === 'orden.cancelada');
    expect(delVendedor).toHaveLength(1);
    expect(delVendedor[0].texto).toBe(`El comprador canceló la orden ${orden.numero}. Los productos volvieron al stock.`);
    expect(avisos.filter((a) => a.usuario_id === comprador.id && a.tipo === 'orden.cancelada')).toHaveLength(0);
  });

  it('con pago pendiente, el cobro queda cancelado y un pago que llega después se rechaza', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 4 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 3 }]);
    const cobro = await s.rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: `cancelar-${sufijo()}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 600_000).toISOString(),
    });
    expect(cobro.error).toBeNull();
    expect(await stockDe(prod.id)).toBe(1);

    const cancelada = await cancelarRaw(orden.id, comprador.id);
    expect(cancelada.error).toBeNull();
    expect(await stockDe(prod.id)).toBe(4);

    const { data: cobros } = await s.from('cobros').select('estado').eq('orden_id', orden.id);
    expect(cobros?.[0].estado).toBe('cancelado');

    const tarde = await s.rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    expect(codigoDe(tarde.error)).toBe('ESTADO_INVALIDO');
    expect((await ordenDe(orden.id)).estado).toBe('cancelada');
    expect(await stockDe(prod.id)).toBe(4);
  });

  it('el vendedor no puede cancelar un pedido de productos', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);

    const intento = await cancelarRaw(orden.id, vendedor.id);
    expect(codigoDe(intento.error)).toBe('NO_PERMITIDO');
    expect((await ordenDe(orden.id)).estado).toBe('creada');
    expect(await stockDe(prod.id)).toBe(4);
  });

  it('un extraño no ve la orden: NO_ENCONTRADA', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);

    const intento = await cancelarRaw(orden.id, (await usuarioNuevo()).id);
    expect(codigoDe(intento.error)).toBe('NO_ENCONTRADA');
    expect((await ordenDe(orden.id)).estado).toBe('creada');
  });

  it('una orden pagada no se cancela: es una disputa', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await pagar(orden.id);

    const intento = await cancelarRaw(orden.id, comprador.id);
    expect(codigoDe(intento.error)).toBe('ESTADO_INVALIDO');
    expect((await ordenDe(orden.id)).estado).toBe('pagada');
    expect(await stockDe(prod.id)).toBe(4);
  });

  it('el motivo tiene que tener entre 4 y 300 caracteres', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);

    const corto = await cancelarRaw(orden.id, comprador.id, 'no');
    expect(codigoDe(corto.error)).toBe('DATOS_INVALIDOS');
    expect((await ordenDe(orden.id)).estado).toBe('creada');
  });

  it('dos cancelaciones de la misma orden: la segunda se rechaza y el stock vuelve una sola vez', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 2 }]);

    const [a, b] = await Promise.all([cancelarRaw(orden.id, comprador.id), cancelarRaw(orden.id, comprador.id)]);
    const ganadoras = [a, b].filter((r) => r.error === null);
    expect(ganadoras).toHaveLength(1);
    expect(codigoDe([a, b].find((r) => r.error !== null)!.error)).toBe('ESTADO_INVALIDO');
    expect(await stockDe(prod.id)).toBe(5);
  });

  it('cancelar y pagar a la vez: gana uno solo', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await s.rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: `carrera-${sufijo()}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 600_000).toISOString(),
    });

    const [cancelar, pago] = await Promise.all([
      cancelarRaw(orden.id, comprador.id),
      s.rpc('confirmar_pago', { p_orden: orden.id, p_actor: null }),
    ]);
    const ganadores = [cancelar, pago].filter((r) => r.error === null);
    expect(ganadores).toHaveLength(1);

    const final = await ordenDe(orden.id);
    if (cancelar.error === null) {
      expect(final.estado).toBe('cancelada');
      expect(await stockDe(prod.id)).toBe(5);
    } else {
      expect(final.estado).toBe('pagada');
      expect(await stockDe(prod.id)).toBe(4);
    }
  });
});

describe('la cancelación de un trabajo sigue igual', () => {
  it('el cliente cancela un trabajo acordado con motivo, y la tienda recibe el aviso', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno);
    const cliente = await usuarioNuevo();
    const trabajo = await contratar(cliente, svc.id);

    const cancelado = await cancelarRaw(trabajo.id, cliente.id, 'Ya no lo necesito.');
    expect(cancelado.error).toBeNull();
    expect(cancelado.data.estado).toBe('cancelada');
    expect(cancelado.data.motivo_cancelacion).toBe('Ya no lo necesito.');
    expect(cancelado.data.tipo).toBe('servicio');

    const avisos = await avisosDe(trabajo.id);
    const delDueno = avisos.filter((a) => a.usuario_id === dueno.id && a.tipo === 'orden.cancelada');
    expect(delDueno).toHaveLength(1);
    expect(delDueno[0].texto).toBe(`La orden ${trabajo.numero} se canceló. Revisá el motivo en la orden.`);
  });
});

describe('lo que ve una sesión y un anónimo', () => {
  it('ninguno ejecuta cancelar_orden: permiso denegado (42501)', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);

    const sesion = await sesionDe(comprador);
    for (const cliente of [sesion, anonimo()]) {
      const { error } = await cliente.rpc('cancelar_orden', {
        p_orden: orden.id,
        p_actor: comprador.id,
        p_motivo: 'Cambié de idea.',
      });
      expect(error?.code).toBe('42501');
    }
    expect((await fila('ordenes', orden.id)).estado).toBe('creada');
  });

  it('el comprador lee el motivo de su cancelación', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await cancelarRaw(orden.id, comprador.id, 'Cambié de idea.');

    const sesion = await sesionDe(comprador);
    const { data, error } = await sesion.from('ordenes').select('estado, motivo_cancelacion').eq('id', orden.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ estado: 'cancelada', motivo_cancelacion: 'Cambié de idea.' }]);
  });
});

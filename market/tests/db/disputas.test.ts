import { afterAll, describe, expect, it } from 'vitest';
import { administrador, avisosDe, codigoDe, negocio, ordenDe, pagar, pedir, producto, servicio, usuarioNuevo, limpiar } from './ayuda';

// Disputes, refunds and the 48 hour window.

afterAll(limpiar);

describe('disputa con reembolso', () => {
  it('el comprador abre, el admin resuelve con reembolso, el vendedor lo marca y el comprador lo confirma', async () => {
    const s = servicio();
    const admin = await administrador();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5, precio: 500 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await pagar(orden.id);

    const abierta = await s.rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: comprador.id,
      p_motivo: 'El producto llegó dañado',
      p_evidencia: 'Foto enviada por el chat',
    });
    expect(abierta.error).toBeNull();
    expect(abierta.data.estado).toBe('abierta');
    expect((await ordenDe(orden.id)).estado).toBe('disputada');
    expect((await ordenDe(orden.id)).disputada_en).not.toBeNull();

    const resuelta = await s.rpc('resolver_disputa', {
      p_orden: orden.id,
      p_actor: admin.id,
      p_resultado: 'reembolso_total',
      p_nota: 'Se devuelve el total',
    });
    expect(resuelta.error).toBeNull();
    expect(resuelta.data.estado).toBe('resuelta');
    expect(resuelta.data.resultado).toBe('reembolso_total');
    expect(resuelta.data.resuelta_por).toBe(admin.id);
    expect((await ordenDe(orden.id)).estado).toBe('resuelta');
    expect((await ordenDe(orden.id)).resuelta_en).not.toBeNull();

    const marcado = await s.rpc('marcar_reembolso', { p_orden: orden.id, p_actor: vendedor.id });
    expect(marcado.error).toBeNull();
    expect(marcado.data.reembolso_marcado_en).not.toBeNull();

    const confirmado = await s.rpc('confirmar_reembolso', { p_orden: orden.id, p_actor: comprador.id });
    expect(confirmado.error).toBeNull();
    expect(confirmado.data.reembolso_confirmado_en).not.toBeNull();

    const avisos = await avisosDe(orden.id);
    const tiposDelComprador = avisos.filter((a) => a.usuario_id === comprador.id).map((a) => a.tipo);
    const tiposDelVendedor = avisos.filter((a) => a.usuario_id === vendedor.id).map((a) => a.tipo);
    expect(tiposDelVendedor).toEqual(expect.arrayContaining(['orden.disputada', 'orden.resuelta', 'reembolso.confirmado']));
    expect(tiposDelComprador).toEqual(expect.arrayContaining(['orden.resuelta', 'reembolso.marcado']));
    expect(tiposDelVendedor.filter((t) => t === 'orden.resuelta')).toHaveLength(1);
    expect(tiposDelComprador.filter((t) => t === 'orden.resuelta')).toHaveLength(1);
  });

  it('sin reembolso no hay nada que marcar', async () => {
    const s = servicio();
    const admin = await administrador();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await pagar(orden.id);

    await s.rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: comprador.id,
      p_motivo: 'No llegó nada',
      p_evidencia: '',
    });
    const resuelta = await s.rpc('resolver_disputa', {
      p_orden: orden.id,
      p_actor: admin.id,
      p_resultado: 'sin_reembolso',
      p_nota: 'La entrega sí se hizo',
    });
    expect(resuelta.error).toBeNull();

    const marcar = await s.rpc('marcar_reembolso', { p_orden: orden.id, p_actor: vendedor.id });
    expect(codigoDe(marcar.error)).toBe('ESTADO_INVALIDO');
  });

  it('no se puede resolver una disputa que no está abierta', async () => {
    const s = servicio();
    const admin = await administrador();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await pagar(orden.id);

    const resolver = await s.rpc('resolver_disputa', {
      p_orden: orden.id,
      p_actor: admin.id,
      p_resultado: 'reembolso_total',
      p_nota: '',
    });
    expect(codigoDe(resolver.error)).toBe('ESTADO_INVALIDO');
  });
});

describe('ventana de 48 horas', () => {
  async function entregadaHace(horas: number) {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    const pagada = await pagar(orden.id);
    await s.rpc('marcar_lista', { p_orden: orden.id, p_actor: vendedor.id });
    await s.rpc('marcar_entregada', { p_orden: orden.id, p_actor: comprador.id, p_codigo: null });
    // Simulate time: move the delivery into the past with the service client.
    const { error } = await s
      .from('ordenes')
      .update({ entregada_en: new Date(Date.now() - horas * 3600_000).toISOString() })
      .eq('id', orden.id);
    expect(error).toBeNull();
    expect(pagada.estado).toBe('pagada');
    return { orden, comprador };
  }

  it('abrir una disputa 47 horas después de la entrega funciona', async () => {
    const { orden, comprador } = await entregadaHace(47);
    const r = await servicio().rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: comprador.id,
      p_motivo: 'Llegó incompleto',
      p_evidencia: '',
    });
    expect(r.error).toBeNull();
    expect((await ordenDe(orden.id)).estado).toBe('disputada');
  });

  it('abrir una disputa 49 horas después de la entrega falla con FUERA_DE_PLAZO', async () => {
    const { orden, comprador } = await entregadaHace(49);
    const r = await servicio().rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: comprador.id,
      p_motivo: 'Llegó incompleto',
      p_evidencia: '',
    });
    expect(codigoDe(r.error)).toBe('FUERA_DE_PLAZO');
    expect((await ordenDe(orden.id)).estado).toBe('entregada');
  });
});

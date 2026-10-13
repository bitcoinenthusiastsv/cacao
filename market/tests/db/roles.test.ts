import { afterAll, describe, expect, it } from 'vitest';
import { codigoDe, negocio, ordenDe, pagar, pedir, pedirRaw, producto, servicio, stockDe, usuarioNuevo, limpiar } from './ayuda';

// Who may do what. A stranger gets NO_ENCONTRADA (the order does not exist for them); a party with
// the wrong role gets NO_PERMITIDO.

afterAll(limpiar);

describe('roles en una orden', () => {
  it('un extraño no puede marcar lista, escribir ni abrir disputa', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const extrano = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await pagar(orden.id);

    const lista = await s.rpc('marcar_lista', { p_orden: orden.id, p_actor: extrano.id });
    expect(codigoDe(lista.error)).toBe('NO_ENCONTRADA');

    const mensaje = await s.rpc('enviar_mensaje', { p_orden: orden.id, p_actor: extrano.id, p_texto: 'Hola' });
    expect(codigoDe(mensaje.error)).toBe('NO_ENCONTRADA');

    const disputa = await s.rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: extrano.id,
      p_motivo: 'No me llegó',
      p_evidencia: '',
    });
    expect(codigoDe(disputa.error)).toBe('NO_ENCONTRADA');

    expect((await ordenDe(orden.id)).estado).toBe('pagada');
  });

  it('el comprador no puede marcar lista ni confirmar el pago; el vendedor no puede abrir disputa', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await s.rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: 'rol-1',
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 600_000).toISOString(),
    });

    const confirmar = await s.rpc('confirmar_pago', { p_orden: orden.id, p_actor: comprador.id });
    expect(codigoDe(confirmar.error)).toBe('NO_PERMITIDO');
    expect((await ordenDe(orden.id)).estado).toBe('esperando_pago');

    await s.rpc('confirmar_pago', { p_orden: orden.id, p_actor: vendedor.id });
    const marcar = await s.rpc('marcar_lista', { p_orden: orden.id, p_actor: comprador.id });
    expect(codigoDe(marcar.error)).toBe('NO_PERMITIDO');

    const disputaDeVendedor = await s.rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: vendedor.id,
      p_motivo: 'Quiero abrir una disputa',
      p_evidencia: '',
    });
    expect(codigoDe(disputaDeVendedor.error)).toBe('NO_PERMITIDO');
  });

  it('una orden en el estado equivocado no cambia: marcar lista antes de pagar es ESTADO_INVALIDO', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);

    const lista = await s.rpc('marcar_lista', { p_orden: orden.id, p_actor: vendedor.id });
    expect(codigoDe(lista.error)).toBe('ESTADO_INVALIDO');
    expect((await ordenDe(orden.id)).estado).toBe('creada');
  });
});

describe('roles de administración', () => {
  it('un no administrador no aprueba negocios ni resuelve disputas', async () => {
    const s = servicio();
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor, { aprobar: false });

    const aprobar = await s.rpc('cambiar_estado_negocio', {
      p_negocio: tienda,
      p_actor: comprador.id,
      p_estado: 'aprobado',
    });
    expect(codigoDe(aprobar.error)).toBe('NO_PERMITIDO');
    expect((await s.from('negocios').select('estado').eq('id', tienda).single()).data?.estado).toBe('pendiente');

    const aprobarPropio = await s.rpc('cambiar_estado_negocio', {
      p_negocio: tienda,
      p_actor: vendedor.id,
      p_estado: 'aprobado',
    });
    expect(codigoDe(aprobarPropio.error)).toBe('NO_PERMITIDO');
  });
});

describe('estado del negocio para los pedidos', () => {
  it('el dueño no puede comprarse a sí mismo', async () => {
    const vendedor = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });

    const r = await pedirRaw(vendedor, tienda, [{ producto: prod.id, cantidad: 1 }]);
    expect(codigoDe(r.error)).toBe('NO_PERMITIDO');
    expect(await stockDe(prod.id)).toBe(5);
  });

  it('un negocio pendiente no recibe pedidos', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor, { aprobar: false });
    const prod = await producto(vendedor, { stock: 5 });

    const r = await pedirRaw(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    expect(codigoDe(r.error)).toBe('NEGOCIO_CERRADO');
    expect(await stockDe(prod.id)).toBe(5);
  });

  it('un negocio cerrado (abierto = false) no recibe pedidos', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5 });

    const cerrar = await servicio().rpc('actualizar_negocio', {
      p_usuario: vendedor.id,
      p_nombre: 'Negocio cerrado de prueba',
      p_descripcion: '',
      p_ubicacion: '',
      p_lightning_address: null,
      p_abierto: false,
    });
    expect(cerrar.error).toBeNull();

    const r = await pedirRaw(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    expect(codigoDe(r.error)).toBe('NEGOCIO_CERRADO');
  });

  it('un producto inactivo no se puede pedir', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 5, activo: false });

    const r = await pedirRaw(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    expect(codigoDe(r.error)).toBe('NO_ENCONTRADA');
    expect(await stockDe(prod.id)).toBe(5);
  });
});

import { afterAll, describe, expect, it } from 'vitest';

import {
  abiertoNegocio,
  avisosDeUsuario,
  fila,
  limpiar,
  limpiarTablon,
  necesidadDe,
  negocio,
  negocioDe,
  ocultarNecesidad,
  ocultarServicio,
  ordenDe,
  servicio,
  servicioDe,
  sufijo,
  usuarioNuevo,
  type Usuario,
} from './ayuda';
import {
  aceptarCotizacion,
  cotizacionesDelNegocio,
  cotizacionPara,
  misCotizacionesComoCliente,
  ofertar,
  rechazarCotizacion,
  responderCotizacion,
  retirarCotizacion,
  solicitarCotizacion,
} from '@/servidor/cotizaciones';

// Quotes and offers on the server, against the local database. Needs and services are made here.

afterAll(async () => {
  await limpiarTablon();
  await limpiar();
});

async function tiendaAprobada(): Promise<{ dueno: Usuario; negocioId: string }> {
  const dueno = await usuarioNuevo();
  return { dueno, negocioId: await negocio(dueno) };
}

async function cotizarServicio(): Promise<{ dueno: Usuario; negocioId: string; servicioId: string }> {
  const { dueno, negocioId } = await tiendaAprobada();
  const svc = await servicioDe(dueno, { tipo: 'cotizar', titulo: `Pintura ${sufijo()}` });
  return { dueno, negocioId, servicioId: svc.id };
}

const DESCRIPCION = 'Pintar la fachada, unos 30 metros cuadrados.';

describe('solicitarCotizacion', () => {
  it('el cliente pide un precio a un servicio a cotizar; el negocio recibe un aviso con su ruta', async () => {
    const cliente = await usuarioNuevo();
    const { dueno, servicioId } = await cotizarServicio();
    const r = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const cot = await fila('cotizaciones', r.dato.id);
    expect(cot.estado).toBe('solicitada');
    expect(cot.cliente_id).toBe(cliente.id);
    expect(cot.descripcion_cliente).toBe(DESCRIPCION);

    const avisos = await avisosDeUsuario(dueno, 'cotizacion.solicitada');
    expect(avisos.some((a) => a.ruta === '/mi-negocio/cotizaciones')).toBe(true);
  });

  it('refuses short descriptions and malformed ids: DATOS_INVALIDOS', async () => {
    const cliente = await usuarioNuevo();
    const { servicioId } = await cotizarServicio();
    const corta = await solicitarCotizacion(cliente.id, { servicioId, descripcion: 'Muy corta' });
    expect(corta.ok).toBe(false);
    if (!corta.ok) expect(corta.codigo).toBe('DATOS_INVALIDOS');

    const servicioMalo = await solicitarCotizacion(cliente.id, { servicioId: 'x', descripcion: DESCRIPCION });
    expect(servicioMalo.ok).toBe(false);
    if (!servicioMalo.ok) expect(servicioMalo.codigo).toBe('DATOS_INVALIDOS');

    const usuarioMalo = await solicitarCotizacion('x', { servicioId, descripcion: DESCRIPCION });
    expect(usuarioMalo.ok).toBe(false);
    if (!usuarioMalo.ok) expect(usuarioMalo.codigo).toBe('DATOS_INVALIDOS');
  });

  it('el propio negocio no se cotiza a sí mismo: NO_PERMITIDO', async () => {
    const { dueno, servicioId } = await cotizarServicio();
    const r = await solicitarCotizacion(dueno.id, { servicioId, descripcion: DESCRIPCION });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('NO_PERMITIDO');
  });

  it('un servicio de precio fijo no se cotiza: ESTADO_INVALIDO', async () => {
    const cliente = await usuarioNuevo();
    const { dueno } = await tiendaAprobada();
    const fijo = await servicioDe(dueno);
    const r = await solicitarCotizacion(cliente.id, { servicioId: fijo.id, descripcion: DESCRIPCION });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('ESTADO_INVALIDO');
  });

  it('un servicio oculto o inexistente: NO_ENCONTRADA', async () => {
    const cliente = await usuarioNuevo();
    const { servicioId } = await cotizarServicio();
    await ocultarServicio(servicioId, true);
    try {
      const oculto = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
      expect(oculto.ok).toBe(false);
      if (!oculto.ok) expect(oculto.codigo).toBe('NO_ENCONTRADA');
    } finally {
      await ocultarServicio(servicioId, false);
    }

    const inexistente = await solicitarCotizacion(cliente.id, {
      servicioId: globalThis.crypto.randomUUID(),
      descripcion: DESCRIPCION,
    });
    expect(inexistente.ok).toBe(false);
    if (!inexistente.ok) expect(inexistente.codigo).toBe('NO_ENCONTRADA');
  });
});

describe('responderCotizacion', () => {
  it('el negocio responde con precio y mensaje; el cliente recibe el aviso', async () => {
    const cliente = await usuarioNuevo();
    const { dueno, servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);

    const r = await responderCotizacion(dueno.id, pedida.dato.id, { precioUsdCentavos: 4000, mensaje: 'Voy el sábado.' });
    expect(r).toEqual({ ok: true, dato: { id: pedida.dato.id } });
    const cot = await fila('cotizaciones', pedida.dato.id);
    expect(cot.estado).toBe('ofrecida');
    expect(cot.precio_usd_centavos).toBe(4000);
    expect(cot.mensaje).toBe('Voy el sábado.');

    const avisos = await avisosDeUsuario(cliente, 'cotizacion.ofrecida');
    expect(avisos.some((a) => a.ruta === '/cotizaciones')).toBe(true);
  });

  it('el cliente no responde su propia cotización: NO_PERMITIDO; un extraño: NO_ENCONTRADA', async () => {
    const cliente = await usuarioNuevo();
    const { servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);

    const deCliente = await responderCotizacion(cliente.id, pedida.dato.id, { precioUsdCentavos: 100, mensaje: '' });
    expect(deCliente.ok).toBe(false);
    if (!deCliente.ok) expect(deCliente.codigo).toBe('NO_PERMITIDO');

    const extraño = await tiendaAprobada();
    const deExtraño = await responderCotizacion(extraño.dueno.id, pedida.dato.id, { precioUsdCentavos: 100, mensaje: '' });
    expect(deExtraño.ok).toBe(false);
    if (!deExtraño.ok) expect(deExtraño.codigo).toBe('NO_ENCONTRADA');
  });

  it('refuses bad prices, long messages and malformed ids: DATOS_INVALIDOS; answering twice is ESTADO_INVALIDO', async () => {
    const cliente = await usuarioNuevo();
    const { dueno, servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);

    const casos: [string, () => ReturnType<typeof responderCotizacion>][] = [
      ['precio cero', () => responderCotizacion(dueno.id, pedida.dato.id, { precioUsdCentavos: 0, mensaje: '' })],
      ['precio de $10,000.01', () => responderCotizacion(dueno.id, pedida.dato.id, { precioUsdCentavos: 1_000_001, mensaje: '' })],
      ['mensaje de 601 caracteres', () => responderCotizacion(dueno.id, pedida.dato.id, { precioUsdCentavos: 100, mensaje: 'm'.repeat(601) })],
      ['cotización malformada', () => responderCotizacion(dueno.id, 'x', { precioUsdCentavos: 100, mensaje: '' })],
    ];
    for (const [nombre, llamar] of casos) {
      const r = await llamar();
      expect(r.ok, nombre).toBe(false);
      if (!r.ok) expect(r.codigo, nombre).toBe('DATOS_INVALIDOS');
    }

    expect((await responderCotizacion(dueno.id, pedida.dato.id, { precioUsdCentavos: 2500, mensaje: '' })).ok).toBe(true);
    const otra_vez = await responderCotizacion(dueno.id, pedida.dato.id, { precioUsdCentavos: 2500, mensaje: '' });
    expect(otra_vez.ok).toBe(false);
    if (!otra_vez.ok) expect(otra_vez.codigo).toBe('ESTADO_INVALIDO');
  });
});

describe('ofertar', () => {
  it('una tienda aprobada oferta en una necesidad; el autor recibe el aviso con la ruta de la necesidad', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const tienda = await tiendaAprobada();

    const r = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: 'Traigo todo.' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oferta = await fila('cotizaciones', r.dato.id);
    expect(oferta.estado).toBe('ofrecida');
    expect(oferta.cliente_id).toBe(autor.id);
    expect(oferta.necesidad_id).toBe(necesidad.id);
    expect(oferta.negocio_id).toBe(tienda.negocioId);

    const avisos = await avisosDeUsuario(autor, 'oferta.nueva');
    expect(avisos.some((a) => a.ruta === `/necesito/${necesidad.id}`)).toBe(true);
  });

  it('una segunda oferta de la misma tienda mientras la primera sigue: ESTADO_INVALIDO', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const tienda = await tiendaAprobada();
    expect((await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: '' })).ok).toBe(true);
    const otra = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 2000, mensaje: '' });
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.codigo).toBe('ESTADO_INVALIDO');
  });

  it('una oferta retirada se reutiliza al volver a ofertar', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const tienda = await tiendaAprobada();
    const primera = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: '' });
    if (!primera.ok) throw new Error(primera.mensaje);
    expect((await retirarCotizacion(tienda.dueno.id, primera.dato.id)).ok).toBe(true);

    const segunda = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 2800, mensaje: 'Mejor precio.' });
    expect(segunda).toEqual({ ok: true, dato: { id: primera.dato.id } });
    expect((await fila('cotizaciones', primera.dato.id)).precio_usd_centavos).toBe(2800);
  });

  it('refuses the author, a shop not yet approved, hidden or closed needs, and bad input', async () => {
    const autor = await tiendaAprobada();
    const propia = await necesidadDe(autor.dueno);
    const deAutor = await ofertar(autor.dueno.id, propia.id, { precioUsdCentavos: 3000, mensaje: '' });
    expect(deAutor.ok).toBe(false);
    if (!deAutor.ok) expect(deAutor.codigo).toBe('NO_PERMITIDO');

    const necesidad = await necesidadDe(await usuarioNuevo());
    const pendiente = await usuarioNuevo();
    await negocio(pendiente, { aprobar: false });
    const deParaPendiente = await ofertar(pendiente.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: '' });
    expect(deParaPendiente.ok).toBe(false);
    if (!deParaPendiente.ok) expect(deParaPendiente.codigo).toBe('NO_PERMITIDO');

    const tienda = await tiendaAprobada();
    const malo = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 0, mensaje: '' });
    expect(malo.ok).toBe(false);
    if (!malo.ok) expect(malo.codigo).toBe('DATOS_INVALIDOS');
    const malaNecesidad = await ofertar(tienda.dueno.id, 'x', { precioUsdCentavos: 3000, mensaje: '' });
    expect(malaNecesidad.ok).toBe(false);
    if (!malaNecesidad.ok) expect(malaNecesidad.codigo).toBe('DATOS_INVALIDOS');

    await ocultarNecesidad(necesidad.id, true);
    const oculta = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: '' });
    expect(oculta.ok).toBe(false);
    if (!oculta.ok) expect(oculta.codigo).toBe('NO_ENCONTRADA');
    await ocultarNecesidad(necesidad.id, false);

    const cerrada = await necesidadDe(await usuarioNuevo());
    await servicio().rpc('cancelar_necesidad', { p_necesidad: cerrada.id, p_usuario: cerrada.usuario_id });
    const tarde = await ofertar(tienda.dueno.id, cerrada.id, { precioUsdCentavos: 3000, mensaje: '' });
    expect(tarde.ok).toBe(false);
    if (!tarde.ok) expect(tarde.codigo).toBe('ESTADO_INVALIDO');
  });
});

describe('retirarCotizacion y rechazarCotizacion', () => {
  it('el negocio retira su oferta; el cliente no la retira; un extraño no la ve', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const tienda = await tiendaAprobada();
    const oferta = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: '' });
    if (!oferta.ok) throw new Error(oferta.mensaje);

    const deCliente = await retirarCotizacion(autor.id, oferta.dato.id);
    expect(deCliente.ok).toBe(false);
    if (!deCliente.ok) expect(deCliente.codigo).toBe('NO_PERMITIDO');

    const extraño = await tiendaAprobada();
    const deExtraño = await retirarCotizacion(extraño.dueno.id, oferta.dato.id);
    expect(deExtraño.ok).toBe(false);
    if (!deExtraño.ok) expect(deExtraño.codigo).toBe('NO_ENCONTRADA');

    const retirada = await retirarCotizacion(tienda.dueno.id, oferta.dato.id);
    expect(retirada).toEqual({ ok: true, dato: { id: oferta.dato.id } });
    expect((await fila('cotizaciones', oferta.dato.id)).estado).toBe('retirada');

    const otra_vez = await retirarCotizacion(tienda.dueno.id, oferta.dato.id);
    expect(otra_vez.ok).toBe(false);
    if (!otra_vez.ok) expect(otra_vez.codigo).toBe('ESTADO_INVALIDO');
  });

  it('el cliente rechaza una cotización; el negocio recibe el aviso; el negocio no puede rechazarla', async () => {
    const cliente = await usuarioNuevo();
    const { dueno, servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);

    const deNegocio = await rechazarCotizacion(dueno.id, pedida.dato.id);
    expect(deNegocio.ok).toBe(false);
    if (!deNegocio.ok) expect(deNegocio.codigo).toBe('NO_PERMITIDO');

    const extraño = await tiendaAprobada();
    const deExtraño = await rechazarCotizacion(extraño.dueno.id, pedida.dato.id);
    expect(deExtraño.ok).toBe(false);
    if (!deExtraño.ok) expect(deExtraño.codigo).toBe('NO_ENCONTRADA');

    const rechazada = await rechazarCotizacion(cliente.id, pedida.dato.id);
    expect(rechazada).toEqual({ ok: true, dato: { id: pedida.dato.id } });
    expect((await fila('cotizaciones', pedida.dato.id)).estado).toBe('rechazada');

    const avisos = await avisosDeUsuario(dueno, 'cotizacion.rechazada');
    expect(avisos.some((a) => a.ruta === '/mi-negocio/cotizaciones')).toBe(true);
  });

  it('refuses malformed ids: DATOS_INVALIDOS', async () => {
    const cliente = await usuarioNuevo();
    const r = await rechazarCotizacion(cliente.id, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('DATOS_INVALIDOS');
    const s = await retirarCotizacion('x', 'y');
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('aceptarCotizacion', () => {
  it('el cliente acepta una oferta: nace un trabajo acordado, la necesidad queda asignada y las demás ofertas se cierran', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor, { titulo: `Techo de lámina ${sufijo()}` });
    const tiendaA = await tiendaAprobada();
    const tiendaB = await tiendaAprobada();
    const ofertaA = await ofertar(tiendaA.dueno.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: '' });
    const ofertaB = await ofertar(tiendaB.dueno.id, necesidad.id, { precioUsdCentavos: 4200, mensaje: '' });
    if (!ofertaA.ok || !ofertaB.ok) throw new Error('No se pudieron crear las ofertas.');

    const r = await aceptarCotizacion(autor.id, ofertaA.dato.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const orden = await ordenDe(r.dato.ordenId);
    expect(orden.tipo).toBe('servicio');
    expect(orden.estado).toBe('acordada');
    expect(orden.total_usd_centavos).toBe(3000);
    expect(orden.comprador_id).toBe(autor.id);
    expect(orden.negocio_id).toBe(tiendaA.negocioId);

    const { data: lineas } = await servicio().from('lineas_orden').select('*').eq('orden_id', r.dato.ordenId);
    expect(lineas![0].servicio_id).toBeNull();
    expect(lineas![0].nombre).toBe(necesidad.titulo);
    expect(lineas![0].unidad).toBe('trabajo');

    expect((await fila('necesidades', necesidad.id)).estado).toBe('asignada');
    expect((await fila('cotizaciones', ofertaB.dato.id)).estado).toBe('rechazada');
    const aceptada = await fila('cotizaciones', ofertaA.dato.id);
    expect(aceptada.estado).toBe('aceptada');
    expect(aceptada.orden_id).toBe(r.dato.ordenId);
  });

  it('aceptar otra vez devuelve el mismo trabajo', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const tienda = await tiendaAprobada();
    const oferta = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 2500, mensaje: '' });
    if (!oferta.ok) throw new Error(oferta.mensaje);

    const primero = await aceptarCotizacion(autor.id, oferta.dato.id);
    const segundo = await aceptarCotizacion(autor.id, oferta.dato.id);
    expect(primero.ok && segundo.ok).toBe(true);
    if (primero.ok && segundo.ok) expect(segundo.dato.ordenId).toBe(primero.dato.ordenId);
  });

  it('dos aceptaciones a la vez de dos ofertas de la misma necesidad: solo una crea trabajo', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const tiendaA = await tiendaAprobada();
    const tiendaB = await tiendaAprobada();
    const ofertaA = await ofertar(tiendaA.dueno.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: '' });
    const ofertaB = await ofertar(tiendaB.dueno.id, necesidad.id, { precioUsdCentavos: 3100, mensaje: '' });
    if (!ofertaA.ok || !ofertaB.ok) throw new Error('No se pudieron crear las ofertas.');

    const [a, b] = await Promise.all([
      aceptarCotizacion(autor.id, ofertaA.dato.id),
      aceptarCotizacion(autor.id, ofertaB.dato.id),
    ]);
    const resultados = [a, b];
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const perdedor = resultados.find((r) => !r.ok);
    expect(perdedor && !perdedor.ok && perdedor.codigo).toBe('ESTADO_INVALIDO');
  });

  it('acepta una cotización de un servicio: el trabajo lleva el servicio en su línea', async () => {
    const cliente = await usuarioNuevo();
    const { dueno, servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);
    await responderCotizacion(dueno.id, pedida.dato.id, { precioUsdCentavos: 6500, mensaje: 'Incluye pintura.' });

    const r = await aceptarCotizacion(cliente.id, pedida.dato.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await ordenDe(r.dato.ordenId)).total_usd_centavos).toBe(6500);
    const { data: lineas } = await servicio().from('lineas_orden').select('*').eq('orden_id', r.dato.ordenId);
    expect(lineas![0].servicio_id).toBe(servicioId);
  });

  it('una cotización solicitada, sin responder, no se acepta: ESTADO_INVALIDO', async () => {
    const cliente = await usuarioNuevo();
    const { servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);
    const r = await aceptarCotizacion(cliente.id, pedida.dato.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('ESTADO_INVALIDO');
  });

  it('el negocio no acepta: NO_PERMITIDO; un extraño: NO_ENCONTRADA; un negocio cerrado: NEGOCIO_CERRADO', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const tienda = await tiendaAprobada();
    const oferta = await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 3000, mensaje: '' });
    if (!oferta.ok) throw new Error(oferta.mensaje);

    const deNegocio = await aceptarCotizacion(tienda.dueno.id, oferta.dato.id);
    expect(deNegocio.ok).toBe(false);
    if (!deNegocio.ok) expect(deNegocio.codigo).toBe('NO_PERMITIDO');

    const extraño = await usuarioNuevo();
    const deExtraño = await aceptarCotizacion(extraño.id, oferta.dato.id);
    expect(deExtraño.ok).toBe(false);
    if (!deExtraño.ok) expect(deExtraño.codigo).toBe('NO_ENCONTRADA');

    await abiertoNegocio(tienda.negocioId, false);
    try {
      const cerrado = await aceptarCotizacion(autor.id, oferta.dato.id);
      expect(cerrado.ok).toBe(false);
      if (!cerrado.ok) expect(cerrado.codigo).toBe('NEGOCIO_CERRADO');
    } finally {
      await abiertoNegocio(tienda.negocioId, true);
    }

    const malo = await aceptarCotizacion('x', oferta.dato.id);
    expect(malo.ok).toBe(false);
    if (!malo.ok) expect(malo.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('listas y cotización para una persona', () => {
  it('el cliente ve sus cotizaciones con el negocio, el título, el precio, el estado y el trabajo al aceptar', async () => {
    const cliente = await usuarioNuevo();
    await servicio().from('usuarios').update({ nombre: 'Diego Hernández' }).eq('id', cliente.id);
    const { dueno, negocioId, servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);
    await responderCotizacion(dueno.id, pedida.dato.id, { precioUsdCentavos: 5000, mensaje: 'Listo.' });
    const aceptada = await aceptarCotizacion(cliente.id, pedida.dato.id);
    if (!aceptada.ok) throw new Error(aceptada.mensaje);

    const lista = await misCotizacionesComoCliente(cliente.id);
    const mia = lista.find((c) => c.id === pedida.dato.id);
    expect(mia).toBeDefined();
    expect(mia!.origen).toBe('servicio');
    expect(mia!.titulo).toMatch(/^Pintura /);
    expect(mia!.negocioId).toBe(negocioId);
    expect(mia!.negocioNombre).toMatch(/Negocio de prueba/);
    expect(mia!.clienteNombre).toBe('Diego');
    expect(mia!.precioUsdCentavos).toBe(5000);
    expect(mia!.estado).toBe('aceptada');
    expect(mia!.ordenId).toBe(aceptada.dato.ordenId);
    expect(mia!.creadaEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(await misCotizacionesComoCliente(dueno.id)).toEqual([]);
  });

  it('el cliente ve las ofertas que recibió en sus necesidades', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor, { titulo: `Limpiar piscina ${sufijo()}` });
    const tienda = await tiendaAprobada();
    await ofertar(tienda.dueno.id, necesidad.id, { precioUsdCentavos: 1800, mensaje: 'Paso el lunes.' });

    const lista = await misCotizacionesComoCliente(autor.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].origen).toBe('necesidad');
    expect(lista[0].necesidadId).toBe(necesidad.id);
    expect(lista[0].titulo).toBe(necesidad.titulo);
    expect(lista[0].estado).toBe('ofrecida');
    expect(lista[0].precioUsdCentavos).toBe(1800);
    expect(lista[0].ordenId).toBeNull();
  });

  it('el negocio ve primero las solicitudes por responder, y luego sus ofertas y respuestas', async () => {
    const { dueno, negocioId, servicioId } = await cotizarServicio();
    const cliente = await usuarioNuevo();
    await servicio().from('usuarios').update({ nombre: 'Rosa Pineda' }).eq('id', cliente.id);

    const respondida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!respondida.ok) throw new Error(respondida.mensaje);
    await responderCotizacion(dueno.id, respondida.dato.id, { precioUsdCentavos: 2000, mensaje: '' });

    const otroCliente = await usuarioNuevo();
    const pendiente = await solicitarCotizacion(otroCliente.id, {
      servicioId,
      descripcion: 'Otro trabajo de pintura, un cuarto.',
    });
    if (!pendiente.ok) throw new Error(pendiente.mensaje);

    const lista = await cotizacionesDelNegocio(negocioId);
    expect(lista[0].id).toBe(pendiente.dato.id);
    expect(lista[0].estado).toBe('solicitada');
    expect(lista[0].descripcion).toBe('Otro trabajo de pintura, un cuarto.');
    expect(lista.find((c) => c.id === respondida.dato.id)!.clienteNombre).toBe('Rosa');
    expect(lista.slice(1).every((c) => c.estado !== 'solicitada')).toBe(true);

    expect(await cotizacionesDelNegocio('no-es-un-uuid')).toEqual([]);
  });

  it('cotizacionPara da la cotización al cliente y al negocio, y null a cualquier otro', async () => {
    const cliente = await usuarioNuevo();
    const { dueno, servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);

    const comoCliente = await cotizacionPara(cliente, pedida.dato.id);
    expect(comoCliente?.rol).toBe('cliente');
    expect(comoCliente?.id).toBe(pedida.dato.id);

    const comoNegocio = await cotizacionPara(dueno, pedida.dato.id);
    expect(comoNegocio?.rol).toBe('vendedor');

    const tercero = await usuarioNuevo();
    expect(await cotizacionPara(tercero, pedida.dato.id)).toBeNull();
    expect(await cotizacionPara(cliente, globalThis.crypto.randomUUID())).toBeNull();
    expect(await cotizacionPara(cliente, 'no-es-un-uuid')).toBeNull();
  });

  it('ninguna lista ni cotización trae teléfono, correo ni código de entrega', async () => {
    const cliente = await usuarioNuevo();
    const { dueno, negocioId, servicioId } = await cotizarServicio();
    const pedida = await solicitarCotizacion(cliente.id, { servicioId, descripcion: DESCRIPCION });
    if (!pedida.ok) throw new Error(pedida.mensaje);

    const texto = JSON.stringify([
      await misCotizacionesComoCliente(cliente.id),
      await cotizacionesDelNegocio(negocioId),
      await cotizacionPara(cliente, pedida.dato.id),
    ]);
    expect(texto).not.toContain(cliente.telefono);
    expect(texto).not.toContain(dueno.telefono);
    expect(texto).not.toMatch(/telefono|correo|codigo_entrega|@/);

    // The shop record itself is still there for the owner's own checks.
    expect((await negocioDe(dueno)).id).toBe(negocioId);
  });
});

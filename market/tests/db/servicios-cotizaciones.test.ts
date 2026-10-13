import { afterAll, describe, expect, it } from 'vitest';
import {
  abiertoNegocio,
  aceptarRaw,
  avisosDeUsuario,
  codigoDe,
  COTIZACION,
  cotizarRaw,
  fila,
  limpiar,
  limpiarTablon,
  necesidadDe,
  negocio,
  ocultarServicio,
  ofertarRaw,
  ordenDe,
  responderRaw,
  servicio,
  servicioDe,
  suspenderNegocio,
  usuarioNuevo,
} from './ayuda';

// Quotes asked from a service, offers on a need, and accepting either one. Accepting is where two
// people can race, so the concurrency tests run the calls at the same time.

afterAll(async () => {
  await limpiarTablon();
  await limpiar();
});

const PASADO = () => new Date(Date.now() - 60_000).toISOString();

describe('pedir una cotización y responderla', () => {
  it('el cliente pide, la tienda responde, el cliente acepta: nace un trabajo acordado con el precio cotizado', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'cotizar', titulo: 'Instalación eléctrica de prueba' });
    const cliente = await usuarioNuevo();

    const pedida = await cotizarRaw(cliente, svc.id, 'Quiero revisar el tablero de la casa.');
    expect(pedida.error).toBeNull();
    expect(pedida.data.estado).toBe('solicitada');
    const avisoTienda = await avisosDeUsuario(dueno, 'cotizacion.solicitada');
    expect(avisoTienda).toHaveLength(1);
    expect(avisoTienda[0].ruta).toBe('/mi-negocio/cotizaciones');

    const ofrecida = await responderRaw(pedida.data.id, dueno, 9500, 'Incluye materiales.');
    expect(ofrecida.error).toBeNull();
    expect(ofrecida.data.estado).toBe('ofrecida');
    expect(ofrecida.data.precio_usd_centavos).toBe(9500);
    const avisoCliente = await avisosDeUsuario(cliente, 'cotizacion.ofrecida');
    expect(avisoCliente).toHaveLength(1);
    expect(avisoCliente[0].texto).toContain('$95.00');
    expect(avisoCliente[0].ruta).toBe('/cotizaciones');

    const aceptada = await aceptarRaw(pedida.data.id, cliente, COTIZACION);
    expect(aceptada.error).toBeNull();
    const orden = aceptada.data;
    expect(orden.tipo).toBe('servicio');
    expect(orden.estado).toBe('acordada');
    expect(orden.total_usd_centavos).toBe(9500);
    expect(orden.total_sats).toBe(95000);
    expect(orden.comprador_id).toBe(cliente.id);

    const { data: lineas } = await servicio().from('lineas_orden').select('*').eq('orden_id', orden.id);
    expect(lineas![0]).toMatchObject({
      nombre: 'Instalación eléctrica de prueba',
      unidad: 'trabajo',
      cantidad: 1,
      precio_usd_centavos: 9500,
      servicio_id: svc.id,
      producto_id: null,
    });

    const cotizacion = await fila('cotizaciones', pedida.data.id);
    expect(cotizacion.estado).toBe('aceptada');
    expect(cotizacion.orden_id).toBe(orden.id);

    const avisosCliente2 = await avisosDeUsuario(cliente, 'orden.acordada');
    expect(avisosCliente2[0].texto).toContain('Coordiná hora y lugar por el chat.');
    const avisosTienda2 = await avisosDeUsuario(dueno, 'orden.acordada');
    expect(avisosTienda2[0].texto).toContain('Cobrás al terminar. Coordiná bien antes de ir.');

    const otraVez = await aceptarRaw(pedida.data.id, cliente, COTIZACION);
    expect(otraVez.error).toBeNull();
    expect(otraVez.data.id).toBe(orden.id);
  });

  it('pedir cotización: a tu propio negocio NO_PERMITIDO; a un servicio fijo ESTADO_INVALIDO; descripción corta DATOS_INVALIDOS', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const cotizable = await servicioDe(dueno, { tipo: 'cotizar' });
    const fijo = await servicioDe(dueno);

    expect(codigoDe((await cotizarRaw(dueno, cotizable.id)).error)).toBe('NO_PERMITIDO');

    const cliente = await usuarioNuevo();
    expect(codigoDe((await cotizarRaw(cliente, fijo.id)).error)).toBe('ESTADO_INVALIDO');
    expect(codigoDe((await cotizarRaw(cliente, cotizable.id, 'corta')).error)).toBe('DATOS_INVALIDOS');
  });

  it('pedir cotización de un servicio oculto responde NO_ENCONTRADA; de un negocio cerrado, NEGOCIO_CERRADO', async () => {
    const dueno = await usuarioNuevo();
    const tienda = await negocio(dueno);
    const oculto = await servicioDe(dueno, { tipo: 'cotizar' });
    await ocultarServicio(oculto.id, true);
    const cliente = await usuarioNuevo();
    expect(codigoDe((await cotizarRaw(cliente, oculto.id)).error)).toBe('NO_ENCONTRADA');

    const visible = await servicioDe(dueno, { tipo: 'cotizar' });
    await abiertoNegocio(tienda, false);
    expect(codigoDe((await cotizarRaw(cliente, visible.id)).error)).toBe('NEGOCIO_CERRADO');
    await abiertoNegocio(tienda, true);
  });

  it('responder: solo la tienda; el cliente recibe NO_PERMITIDO, un extraño NO_ENCONTRADA; precio cero y segunda respuesta fallan', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'cotizar' });
    const cliente = await usuarioNuevo();
    const pedida = await cotizarRaw(cliente, svc.id);

    expect(codigoDe((await responderRaw(pedida.data.id, cliente, 1000)).error)).toBe('NO_PERMITIDO');
    expect(codigoDe((await responderRaw(pedida.data.id, await usuarioNuevo(), 1000)).error)).toBe('NO_ENCONTRADA');
    expect(codigoDe((await responderRaw(pedida.data.id, dueno, 0)).error)).toBe('DATOS_INVALIDOS');

    expect((await responderRaw(pedida.data.id, dueno, 1000)).error).toBeNull();
    expect(codigoDe((await responderRaw(pedida.data.id, dueno, 1200)).error)).toBe('ESTADO_INVALIDO');
  });

  it('el cliente rechaza una cotización y la tienda se entera; la tienda retira una solicitud', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'cotizar' });
    const cliente = await usuarioNuevo();

    const rechazada = await cotizarRaw(cliente, svc.id);
    await responderRaw(rechazada.data.id, dueno, 2000);
    const rechazo = await servicio().rpc('rechazar_cotizacion', { p_cotizacion: rechazada.data.id, p_actor: cliente.id });
    expect(rechazo.data.estado).toBe('rechazada');
    expect(await avisosDeUsuario(dueno, 'cotizacion.rechazada')).toHaveLength(1);

    const retirada = await cotizarRaw(cliente, svc.id, 'Otro trabajo, con más detalle.');
    const retiro = await servicio().rpc('retirar_cotizacion', { p_cotizacion: retirada.data.id, p_actor: dueno.id });
    expect(retiro.data.estado).toBe('retirada');
    expect(codigoDe((await servicio().rpc('retirar_cotizacion', { p_cotizacion: rechazada.data.id, p_actor: dueno.id })).error)).toBe('ESTADO_INVALIDO');
  });

  it('una cotización ofrecida no se acepta si la tienda queda suspendida; ni la acepta otro cliente', async () => {
    const dueno = await usuarioNuevo();
    const tienda = await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'cotizar' });
    const cliente = await usuarioNuevo();
    const pedida = await cotizarRaw(cliente, svc.id);
    await responderRaw(pedida.data.id, dueno, 3000);

    const otro = await usuarioNuevo();
    expect(codigoDe((await aceptarRaw(pedida.data.id, otro)).error)).toBe('NO_ENCONTRADA');
    expect(codigoDe((await aceptarRaw(pedida.data.id, dueno)).error)).toBe('NO_PERMITIDO');
    expect(codigoDe((await aceptarRaw(pedida.data.id, cliente, 0)).error)).toBe('DATOS_INVALIDOS');

    await suspenderNegocio(tienda);
    expect(codigoDe((await aceptarRaw(pedida.data.id, cliente)).error)).toBe('NEGOCIO_CERRADO');
  });
});

describe('aceptar una oferta del tablón', () => {
  it('dos aceptaciones a la vez de dos ofertas de una necesidad: una sola orden, la necesidad asignada, la otra oferta rechazada', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor, { titulo: 'Corte de pelo para la boda' });
    const primero = await usuarioNuevo();
    await negocio(primero);
    const segundo = await usuarioNuevo();
    await negocio(segundo);
    const oferta1 = await ofertarRaw(primero, necesidad.id, 4000);
    const oferta2 = await ofertarRaw(segundo, necesidad.id, 3500);
    expect(oferta1.error).toBeNull();
    expect(oferta2.error).toBeNull();

    const [a, b] = await Promise.all([
      aceptarRaw(oferta1.data.id, autor, COTIZACION),
      aceptarRaw(oferta2.data.id, autor, COTIZACION),
    ]);
    const ganadores = [a, b].filter((r) => r.error === null);
    const perdedores = [a, b].filter((r) => r.error !== null);
    expect(ganadores).toHaveLength(1);
    expect(perdedores).toHaveLength(1);
    expect(codigoDe(perdedores[0].error)).toBe('ESTADO_INVALIDO');
    expect(perdedores[0].error!.message).toContain('ESTADO_INVALIDO: Esa necesidad ya fue asignada.');

    expect((await fila('necesidades', necesidad.id)).estado).toBe('asignada');
    const estados = [(await fila('cotizaciones', oferta1.data.id)).estado, (await fila('cotizaciones', oferta2.data.id)).estado];
    expect(estados.sort()).toEqual(['aceptada', 'rechazada']);

    const { data: ordenes } = await servicio()
      .from('ordenes')
      .select('id')
      .eq('comprador_id', autor.id)
      .eq('tipo', 'servicio');
    expect(ordenes).toHaveLength(1);
  });

  it('la misma oferta aceptada dos veces a la vez devuelve la misma orden', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 2500);

    const [a, b] = await Promise.all([aceptarRaw(oferta.data.id, autor), aceptarRaw(oferta.data.id, autor)]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data.id).toBe(b.data.id);
    expect((await ordenDe(a.data.id)).estado).toBe('acordada');
  });

  it('una oferta ajena no se acepta; la propia tienda tampoco puede aceptarla', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 2500);

    expect(codigoDe((await aceptarRaw(oferta.data.id, await usuarioNuevo())).error)).toBe('NO_ENCONTRADA');
    expect(codigoDe((await aceptarRaw(oferta.data.id, dueno)).error)).toBe('NO_PERMITIDO');
  });

  it('una necesidad pasada de plazo no acepta ofertas', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 2500);
    await servicio().from('necesidades').update({ vence_en: PASADO() }).eq('id', necesidad.id);

    expect(codigoDe((await aceptarRaw(oferta.data.id, autor)).error)).toBe('ESTADO_INVALIDO');
  });

  it('cancelar el trabajo de una necesidad abierta la reabre, y la tienda puede volver a ofertar', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 4000);
    const aceptada = await aceptarRaw(oferta.data.id, autor);
    expect(aceptada.error).toBeNull();

    const cancelada = await servicio().rpc('cancelar_orden', {
      p_orden: aceptada.data.id,
      p_actor: autor.id,
      p_motivo: 'Encontré otra opción.',
    });
    expect(cancelada.error).toBeNull();
    expect(cancelada.data.estado).toBe('cancelada');
    expect((await fila('necesidades', necesidad.id)).estado).toBe('abierta');
    expect((await fila('cotizaciones', oferta.data.id)).estado).toBe('retirada');

    const otraVez = await ofertarRaw(dueno, necesidad.id, 3900, 'Nuevo precio.');
    expect(otraVez.error).toBeNull();
    expect(otraVez.data.id).toBe(oferta.data.id);
    expect(otraVez.data.estado).toBe('ofrecida');
  });

  it('cancelar el trabajo de una necesidad ya vencida no la reabre', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 4000);
    const aceptada = await aceptarRaw(oferta.data.id, autor);
    await servicio().from('necesidades').update({ vence_en: PASADO() }).eq('id', necesidad.id);

    const cancelada = await servicio().rpc('cancelar_orden', {
      p_orden: aceptada.data.id,
      p_actor: dueno.id,
      p_motivo: 'No llegamos a tiempo.',
    });
    expect(cancelada.data.estado).toBe('cancelada');
    expect((await fila('necesidades', necesidad.id)).estado).toBe('asignada');
  });
});

describe('una oferta de una tienda que después queda suspendida', () => {
  it('una oferta de una tienda que ya no está aprobada no se acepta', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    const tienda = await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 2500);
    await suspenderNegocio(tienda);

    expect(codigoDe((await aceptarRaw(oferta.data.id, autor)).error)).toBe('NEGOCIO_CERRADO');
    expect((await avisosDeUsuario(autor, 'oferta.nueva')).length).toBe(1);
  });
});

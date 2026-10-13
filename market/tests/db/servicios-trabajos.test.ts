import { afterAll, describe, expect, it } from 'vitest';
import {
  abiertoNegocio,
  administrador,
  auditoriaDe,
  avisosDeUsuario,
  codigoDe,
  COTIZACION,
  contratar,
  contratarRaw,
  limpiar,
  limpiarTablon,
  marcarHechaRaw,
  negocio,
  ocultarServicio,
  ordenDe,
  pagar,
  pagarTrabajo,
  pedir,
  producto,
  servicio,
  servicioDe,
  suspenderNegocio,
  sufijo,
  usuarioNuevo,
} from './ayuda';

// Service jobs: hiring, the job's states, cancellation, an expired payment request, the circularity
// metric and disputes on jobs that were never paid.

afterAll(async () => {
  await limpiarTablon();
  await limpiar();
});

const FUTURO = () => new Date(Date.now() + 600_000).toISOString();
const PASADO = () => new Date(Date.now() - 60_000).toISOString();

// A shop with a fixed-price service, and a client.
async function preparar(precio = 500) {
  const dueno = await usuarioNuevo();
  const tienda = await negocio(dueno);
  const svc = await servicioDe(dueno, { precio, unidad: 'por corte' });
  const cliente = await usuarioNuevo();
  return { dueno, tienda, svc, cliente };
}

describe('contratar un servicio de precio fijo', () => {
  it('crea un trabajo acordado con el precio y la unidad del servicio; la nota es el primer mensaje', async () => {
    const { dueno, svc, cliente } = await preparar(500);
    const orden = await contratar(cliente, svc.id, { nota: 'Mañana a las 3 en mi casa.' });

    expect(orden.tipo).toBe('servicio');
    expect(orden.estado).toBe('acordada');
    expect(orden.total_usd_centavos).toBe(500);
    expect(orden.total_sats).toBe(5000);
    expect(orden.modo_entrega).toBeNull();
    expect(orden.codigo_entrega).toBeNull();

    const { data: lineas } = await servicio().from('lineas_orden').select('*').eq('orden_id', orden.id);
    expect(lineas).toHaveLength(1);
    expect(lineas![0]).toMatchObject({ servicio_id: svc.id, producto_id: null, unidad: 'por corte', precio_usd_centavos: 500, cantidad: 1 });

    const { data: mensajes } = await servicio().from('mensajes').select('texto, autor_id').eq('orden_id', orden.id);
    expect(mensajes).toEqual([{ texto: 'Mañana a las 3 en mi casa.', autor_id: cliente.id }]);

    const avisos = await avisosDeUsuario(dueno, 'orden.acordada');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].texto).toContain('Cobrás al terminar. Coordiná bien antes de ir.');
  });

  it('un doble toque, al mismo tiempo, crea un solo trabajo', async () => {
    const { svc, cliente } = await preparar();
    const clave = `doble-${sufijo()}`;
    const [a, b] = await Promise.all([contratarRaw(cliente, svc.id, { clave }), contratarRaw(cliente, svc.id, { clave })]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data.id).toBe(b.data.id);

    const { data: ordenes } = await servicio()
      .from('ordenes')
      .select('id')
      .eq('comprador_id', cliente.id)
      .eq('clave_idempotencia', clave);
    expect(ordenes).toHaveLength(1);
  });

  it('un reintento devuelve el trabajo aunque el servicio ya esté oculto', async () => {
    const { svc, cliente } = await preparar();
    const clave = `reintento-${sufijo()}`;
    const primera = await contratar(cliente, svc.id, { clave });
    await ocultarServicio(svc.id, true);
    const segunda = await contratarRaw(cliente, svc.id, { clave });
    expect(segunda.error).toBeNull();
    expect(segunda.data.id).toBe(primera.id);
  });

  it('no contratás tu propio servicio', async () => {
    const { dueno, svc } = await preparar();
    const r = await contratarRaw(dueno, svc.id);
    expect(codigoDe(r.error)).toBe('NO_PERMITIDO');
  });

  it('un servicio oculto, pausado o de un negocio suspendido responde NO_ENCONTRADA', async () => {
    const { svc, cliente, dueno } = await preparar();
    await ocultarServicio(svc.id, true);
    expect(codigoDe((await contratarRaw(cliente, svc.id)).error)).toBe('NO_ENCONTRADA');

    const pausado = await servicioDe(dueno, { activo: false });
    expect(codigoDe((await contratarRaw(cliente, pausado.id)).error)).toBe('NO_ENCONTRADA');

    const otro = await usuarioNuevo();
    const tiendaOtra = await negocio(otro);
    const deSuspendido = await servicioDe(otro);
    await suspenderNegocio(tiendaOtra);
    expect(codigoDe((await contratarRaw(cliente, deSuspendido.id)).error)).toBe('NO_ENCONTRADA');
  });

  it('un negocio cerrado no recibe contrataciones', async () => {
    const { tienda, svc, cliente } = await preparar();
    await abiertoNegocio(tienda, false);
    const r = await contratarRaw(cliente, svc.id);
    expect(codigoDe(r.error)).toBe('NEGOCIO_CERRADO');
  });

  it('un servicio a cotizar no se contrata: ESTADO_INVALIDO', async () => {
    const { dueno, cliente } = await preparar();
    const cotizable = await servicioDe(dueno, { tipo: 'cotizar' });
    const r = await contratarRaw(cliente, cotizable.id);
    expect(codigoDe(r.error)).toBe('ESTADO_INVALIDO');
  });

  it('nota de más de 600 caracteres, clave vacía, cotización cero o servicio inexistente', async () => {
    const { svc, cliente } = await preparar();
    expect(codigoDe((await contratarRaw(cliente, svc.id, { nota: 'x'.repeat(601) })).error)).toBe('DATOS_INVALIDOS');
    expect(codigoDe((await contratarRaw(cliente, svc.id, { clave: '   ' })).error)).toBe('DATOS_INVALIDOS');
    expect(codigoDe((await contratarRaw(cliente, svc.id, { cotizacionBtc: 0 })).error)).toBe('DATOS_INVALIDOS');
    expect(codigoDe((await contratarRaw(cliente, '00000000-0000-4000-8000-000000000000')).error)).toBe('NO_ENCONTRADA');
  });

  it('el precio acordado sobrevive a un cambio de precio o a una pausa', async () => {
    const { dueno, svc, cliente } = await preparar(500);
    const orden = await contratar(cliente, svc.id);

    const { error } = await servicio().rpc('guardar_servicio', {
      p_usuario: dueno.id,
      p_servicio: svc.id,
      p_categoria: svc.categoria_id,
      p_titulo: svc.titulo,
      p_descripcion: '',
      p_zona: '',
      p_tipo_precio: 'fijo',
      p_precio: 900,
      p_unidad: 'por corte',
      p_activo: false,
      p_fotos: [],
    });
    expect(error).toBeNull();

    const despues = await ordenDe(orden.id);
    expect(despues.total_usd_centavos).toBe(500);
    const { data: lineas } = await servicio().from('lineas_orden').select('precio_usd_centavos').eq('orden_id', orden.id);
    expect(lineas![0].precio_usd_centavos).toBe(500);

    expect(codigoDe((await contratarRaw(cliente, svc.id)).error)).toBe('NO_ENCONTRADA');
  });
});

describe('el ciclo de un trabajo de precio fijo', () => {
  it('acordada, hecha, pagada, entregada, reseña y cerrada, con el proveedor falso', async () => {
    const { dueno, svc, cliente } = await preparar(500);
    const extrano = await usuarioNuevo();
    const orden = await contratar(cliente, svc.id);

    expect(codigoDe((await marcarHechaRaw(orden.id, extrano)).error)).toBe('NO_ENCONTRADA');
    expect(codigoDe((await marcarHechaRaw(orden.id, cliente)).error)).toBe('NO_PERMITIDO');

    const hecha = await marcarHechaRaw(orden.id, dueno);
    expect(hecha.error).toBeNull();
    expect(hecha.data.estado).toBe('hecha');
    expect(hecha.data.hecha_en).not.toBeNull();

    const avisoHecha = await avisosDeUsuario(cliente, 'orden.hecha');
    expect(avisoHecha).toHaveLength(1);
    expect(avisoHecha[0].texto).toBe(`El trabajo de la orden ${orden.numero} está hecho. Ya podés pagar.`);

    const cobro = await servicio().rpc('registrar_cobro_servicio', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: `ciclo-${sufijo()}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: FUTURO(),
      p_cotizacion_btc: COTIZACION,
    });
    expect(cobro.error).toBeNull();
    expect(cobro.data.estado).toBe('pendiente');
    const esperando = await ordenDe(orden.id);
    expect(esperando.estado).toBe('esperando_pago');
    expect(esperando.total_sats).toBe(5000);
    expect(esperando.cotizacion_usd_btc).toBe(COTIZACION);

    const pagada = await servicio().rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    expect(pagada.error).toBeNull();
    expect(pagada.data.estado).toBe('entregada');
    expect(pagada.data.pagada_en).not.toBeNull();
    expect(pagada.data.entregada_en).not.toBeNull();
    expect(pagada.data.codigo_entrega).toBeNull();

    const resena = await servicio().rpc('crear_resena', {
      p_orden: orden.id,
      p_actor: cliente.id,
      p_puntuacion: 5,
      p_comentario: 'Buen trabajo',
    });
    expect(resena.error).toBeNull();
    expect((await ordenDe(orden.id)).estado).toBe('cerrada');

    const acciones = (await auditoriaDe(orden.id)).map((a) => a.accion);
    expect(acciones).toEqual(
      expect.arrayContaining(['orden.acordada', 'orden.hecha', 'orden.esperando_pago', 'orden.pagada', 'orden.entregada', 'orden.cerrada']),
    );

    // Paying, the buyer and the shop each hear once.
    expect(await avisosDeUsuario(cliente, 'orden.pagada')).toHaveLength(1);
    expect(await avisosDeUsuario(dueno, 'orden.pagada')).toHaveLength(1);
  });
});

describe('cancelar un trabajo', () => {
  it('el cliente cancela con un motivo; después no se marca hecha ni se escribe en el chat', async () => {
    const { dueno, svc, cliente } = await preparar();
    const orden = await contratar(cliente, svc.id);
    const extrano = await usuarioNuevo();

    const corto = await servicio().rpc('cancelar_orden', { p_orden: orden.id, p_actor: cliente.id, p_motivo: 'no' });
    expect(codigoDe(corto.error)).toBe('DATOS_INVALIDOS');
    const ajeno = await servicio().rpc('cancelar_orden', {
      p_orden: orden.id,
      p_actor: extrano.id,
      p_motivo: 'Ya no lo necesito.',
    });
    expect(codigoDe(ajeno.error)).toBe('NO_ENCONTRADA');

    const cancelada = await servicio().rpc('cancelar_orden', {
      p_orden: orden.id,
      p_actor: cliente.id,
      p_motivo: 'Ya no lo necesito, gracias.',
    });
    expect(cancelada.error).toBeNull();
    expect(cancelada.data.estado).toBe('cancelada');
    expect(cancelada.data.cancelada_en).not.toBeNull();
    expect(cancelada.data.motivo_cancelacion).toBe('Ya no lo necesito, gracias.');
    expect(await avisosDeUsuario(dueno, 'orden.cancelada')).toHaveLength(1);

    expect(codigoDe((await marcarHechaRaw(orden.id, dueno)).error)).toBe('ESTADO_INVALIDO');
    const mensaje = await servicio().rpc('enviar_mensaje', { p_orden: orden.id, p_actor: cliente.id, p_texto: 'Hola' });
    expect(codigoDe(mensaje.error)).toBe('ESTADO_INVALIDO');
  });

  it('el negocio también puede cancelar un trabajo acordado; uno ya hecho no se cancela', async () => {
    const { dueno, svc, cliente } = await preparar();
    const acordada = await contratar(cliente, svc.id);
    const porNegocio = await servicio().rpc('cancelar_orden', {
      p_orden: acordada.id,
      p_actor: dueno.id,
      p_motivo: 'No tengo el material.',
    });
    expect(porNegocio.data.estado).toBe('cancelada');
    expect(await avisosDeUsuario(cliente, 'orden.cancelada')).toHaveLength(1);

    const hecha = await contratar(cliente, svc.id);
    await marcarHechaRaw(hecha.id, dueno);
    const tarde = await servicio().rpc('cancelar_orden', {
      p_orden: hecha.id,
      p_actor: cliente.id,
      p_motivo: 'Cambié de idea.',
    });
    expect(codigoDe(tarde.error)).toBe('ESTADO_INVALIDO');
  });

  it('el chat sirve en acordada, en hecha y después de pagar', async () => {
    const { dueno, svc, cliente } = await preparar();
    const orden = await contratar(cliente, svc.id);
    const enAcordada = await servicio().rpc('enviar_mensaje', { p_orden: orden.id, p_actor: cliente.id, p_texto: 'Llego a las 3.' });
    expect(enAcordada.error).toBeNull();

    await marcarHechaRaw(orden.id, dueno);
    const enHecha = await servicio().rpc('enviar_mensaje', { p_orden: orden.id, p_actor: dueno.id, p_texto: 'Listo, te espero.' });
    expect(enHecha.error).toBeNull();

    const pagada = await pagarTrabajo(orden.id);
    expect(pagada.estado).toBe('entregada');
    const despues = await servicio().rpc('enviar_mensaje', { p_orden: orden.id, p_actor: cliente.id, p_texto: 'Gracias.' });
    expect(despues.error).toBeNull();
  });
});

describe('la solicitud de pago que vence', () => {
  // A job marked done, with a payment request that is already past its deadline.
  async function hechaConSolicitudVencida() {
    const { dueno, svc, cliente } = await preparar(500);
    const orden = await contratar(cliente, svc.id);
    await marcarHechaRaw(orden.id, dueno);
    const cobro = await servicio().rpc('registrar_cobro_servicio', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: 'vieja-1',
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: PASADO(),
      p_cotizacion_btc: COTIZACION,
    });
    expect(cobro.error).toBeNull();
    return { dueno, cliente, orden };
  }

  it('pagarla tarde falla con FUERA_DE_PLAZO; al vencer, la orden vuelve a hecha y pagar la vieja no la marca pagada', async () => {
    const { orden } = await hechaConSolicitudVencida();

    const tarde = await servicio().rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    expect(codigoDe(tarde.error)).toBe('FUERA_DE_PLAZO');
    expect((await ordenDe(orden.id)).estado).toBe('esperando_pago');

    const { data: vencidas, error } = await servicio().rpc('expirar_ordenes');
    expect(error).toBeNull();
    expect(vencidas).toBeGreaterThanOrEqual(1);

    const hecha = await ordenDe(orden.id);
    expect(hecha.estado).toBe('hecha');
    expect(hecha.pagada_en).toBeNull();
    const { data: cobros } = await servicio().from('cobros').select('estado').eq('orden_id', orden.id);
    expect(cobros![0].estado).toBe('expirado');

    const otraVez = await servicio().rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    expect(codigoDe(otraVez.error)).toBe('ESTADO_INVALIDO');
    const despues = await ordenDe(orden.id);
    expect(despues.estado).toBe('hecha');
    expect(despues.pagada_en).toBeNull();
  });

  it('se puede pedir otra solicitud: reemplaza la vieja, y esa sí se paga', async () => {
    const { orden } = await hechaConSolicitudVencida();
    await servicio().rpc('expirar_ordenes');

    const nueva = await servicio().rpc('registrar_cobro_servicio', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: 'nueva-1',
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: FUTURO(),
      p_cotizacion_btc: COTIZACION,
    });
    expect(nueva.error).toBeNull();
    expect(nueva.data.referencia_externa).toBe('nueva-1');

    const { data: cobros } = await servicio().from('cobros').select('referencia_externa, estado').eq('orden_id', orden.id);
    expect(cobros).toEqual([{ referencia_externa: 'nueva-1', estado: 'pendiente' }]);

    const pagada = await servicio().rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
    expect(pagada.error).toBeNull();
    expect(pagada.data.estado).toBe('entregada');
  });

  it('pedir pago de un trabajo que no está hecha, o con cotización cero, se refuta', async () => {
    const { dueno, svc, cliente } = await preparar();
    const acordada = await contratar(cliente, svc.id);
    const sinHacer = await servicio().rpc('registrar_cobro_servicio', {
      p_orden: acordada.id,
      p_proveedor: 'falso',
      p_referencia: 'pronto',
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: FUTURO(),
      p_cotizacion_btc: COTIZACION,
    });
    expect(codigoDe(sinHacer.error)).toBe('ESTADO_INVALIDO');

    const hecha = await contratar(cliente, svc.id);
    await marcarHechaRaw(hecha.id, dueno);
    const cero = await servicio().rpc('registrar_cobro_servicio', {
      p_orden: hecha.id,
      p_proveedor: 'falso',
      p_referencia: 'cero',
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: FUTURO(),
      p_cotizacion_btc: 0,
    });
    expect(codigoDe(cero.error)).toBe('DATOS_INVALIDOS');
  });
});

describe('circularidad con trabajos', () => {
  it('un trabajo pagado suma a los sats cobrados del negocio; uno sin pagar o cancelado no', async () => {
    const dueno = await usuarioNuevo();
    const tienda = await negocio(dueno);
    const svc = await servicioDe(dueno, { precio: 500 });
    const clienteA = await usuarioNuevo();
    const clienteB = await usuarioNuevo();
    const clienteC = await usuarioNuevo();

    const cuenta = async () => {
      const { data, error } = await servicio()
        .from('circularidad_negocios')
        .select('sats_cobrados')
        .eq('negocio_id', tienda)
        .single();
      expect(error).toBeNull();
      return Number(data!.sats_cobrados);
    };

    expect(await cuenta()).toBe(0);

    const hecha = await contratar(clienteA, svc.id);
    await marcarHechaRaw(hecha.id, dueno);
    expect(await cuenta()).toBe(0);

    const cancelada = await contratar(clienteB, svc.id);
    await servicio().rpc('cancelar_orden', { p_orden: cancelada.id, p_actor: clienteB.id, p_motivo: 'Ya no lo necesito.' });
    expect(await cuenta()).toBe(0);

    const pagado = await contratar(clienteC, svc.id);
    await marcarHechaRaw(pagado.id, dueno);
    await pagarTrabajo(pagado.id);
    expect(await cuenta()).toBe(5000);
  });
});

describe('disputa de un trabajo sin pagar', () => {
  // A job marked done and never paid, with the client's dispute open.
  async function enDisputa() {
    const { dueno, svc, cliente } = await preparar(500);
    const orden = await contratar(cliente, svc.id);
    await marcarHechaRaw(orden.id, dueno);
    const abierta = await servicio().rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: cliente.id,
      p_motivo: 'El trabajo no quedó bien.',
      p_evidencia: '',
    });
    expect(abierta.error).toBeNull();
    expect((await ordenDe(orden.id)).estado).toBe('disputada');
    return { dueno, cliente, orden };
  }

  it('el cliente abre la disputa en un trabajo hecho; corresponde pagar devuelve la orden a hecha', async () => {
    const { dueno, orden } = await enDisputa();
    const admin = await administrador();
    const resuelta = await servicio().rpc('resolver_disputa', {
      p_orden: orden.id,
      p_actor: admin.id,
      p_resultado: 'corresponde_pagar',
      p_nota: 'El trabajo se hizo.',
    });
    expect(resuelta.error).toBeNull();
    expect(resuelta.data.estado).toBe('resuelta');
    expect(resuelta.data.resultado).toBe('corresponde_pagar');
    expect((await ordenDe(orden.id)).estado).toBe('hecha');
    expect(await avisosDeUsuario(dueno, 'orden.hecha')).toHaveLength(1);

    const pagada = await pagarTrabajo(orden.id);
    expect(pagada.estado).toBe('entregada');
  });

  it('no corresponde pagar cancela el trabajo y la nota queda como motivo', async () => {
    const { orden } = await enDisputa();
    const admin = await administrador();
    const resuelta = await servicio().rpc('resolver_disputa', {
      p_orden: orden.id,
      p_actor: admin.id,
      p_resultado: 'no_corresponde_pagar',
      p_nota: 'El trabajo no se hizo.',
    });
    expect(resuelta.error).toBeNull();
    expect(resuelta.data.resultado).toBe('no_corresponde_pagar');

    const cancelada = await ordenDe(orden.id);
    expect(cancelada.estado).toBe('cancelada');
    expect(cancelada.cancelada_en).not.toBeNull();
    expect(cancelada.motivo_cancelacion).toBe('El trabajo no se hizo.');
  });

  it('un trabajo sin pagar no admite los resultados de dinero; un pedido de productos no admite los nuevos', async () => {
    const { orden } = await enDisputa();
    const admin = await administrador();
    const dinero = await servicio().rpc('resolver_disputa', {
      p_orden: orden.id,
      p_actor: admin.id,
      p_resultado: 'reembolso_total',
      p_nota: '',
    });
    expect(codigoDe(dinero.error)).toBe('DATOS_INVALIDOS');
    expect((await ordenDe(orden.id)).estado).toBe('disputada');

    const dueno = await usuarioNuevo();
    const tienda = await negocio(dueno);
    const prod = await producto(dueno, { stock: 5 });
    const comprador = await usuarioNuevo();
    const pedido = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await pagar(pedido.id);
    await servicio().rpc('abrir_disputa', {
      p_orden: pedido.id,
      p_actor: comprador.id,
      p_motivo: 'Llegó dañado',
      p_evidencia: '',
    });
    const nuevo = await servicio().rpc('resolver_disputa', {
      p_orden: pedido.id,
      p_actor: admin.id,
      p_resultado: 'corresponde_pagar',
      p_nota: '',
    });
    expect(codigoDe(nuevo.error)).toBe('DATOS_INVALIDOS');
    expect((await ordenDe(pedido.id)).estado).toBe('disputada');
  });

  it('un trabajo pagado conserva los tres resultados de siempre', async () => {
    const { dueno, svc, cliente } = await preparar(500);
    const orden = await contratar(cliente, svc.id);
    await marcarHechaRaw(orden.id, dueno);
    await pagarTrabajo(orden.id);

    const abierta = await servicio().rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: cliente.id,
      p_motivo: 'Quedó a medias.',
      p_evidencia: '',
    });
    expect(abierta.error).toBeNull();

    const admin = await administrador();
    const resuelta = await servicio().rpc('resolver_disputa', {
      p_orden: orden.id,
      p_actor: admin.id,
      p_resultado: 'reembolso_total',
      p_nota: 'Se devuelve el total.',
    });
    expect(resuelta.error).toBeNull();
    expect(resuelta.data.resultado).toBe('reembolso_total');
    expect((await ordenDe(orden.id)).estado).toBe('resuelta');
  });

  it('abrir una disputa en un trabajo acordado, todavía sin hacer, es ESTADO_INVALIDO', async () => {
    const { svc, cliente } = await preparar();
    const orden = await contratar(cliente, svc.id);
    const r = await servicio().rpc('abrir_disputa', {
      p_orden: orden.id,
      p_actor: cliente.id,
      p_motivo: 'Todavía no empezó.',
      p_evidencia: '',
    });
    expect(codigoDe(r.error)).toBe('ESTADO_INVALIDO');
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import {
  anonimo,
  avisosDeUsuario,
  categoriaServicioDePrueba,
  codigoDe,
  contratar,
  cotizarRaw,
  fila,
  limpiar,
  limpiarTablon,
  necesidadDe,
  negocio,
  ocultarNecesidad,
  ocultarServicio,
  ofertarRaw,
  responderRaw,
  servicio,
  servicioDe,
  sesionDe,
  sufijo,
  usuarioNuevo,
} from './ayuda';

// Row-level security and grants for the services tables, checked with real user sessions and with the
// anonymous key. Writes from a session must fail, and the new functions must be closed to sessions.

afterAll(async () => {
  await limpiarTablon();
  await limpiar();
});

describe('cotizaciones solo las leen el cliente y la tienda', () => {
  it('el cliente y la tienda ven la cotización; otro usuario y un anónimo no ven nada', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'cotizar' });
    const cliente = await usuarioNuevo();
    const pedida = await cotizarRaw(cliente, svc.id);

    const deCliente = await sesionDe(cliente);
    const deTienda = await sesionDe(dueno);
    const deOtro = await sesionDe(await usuarioNuevo());

    const vistaCliente = await deCliente.from('cotizaciones').select('id').eq('id', pedida.data.id);
    expect(vistaCliente.error).toBeNull();
    expect(vistaCliente.data).toHaveLength(1);

    const vistaTienda = await deTienda.from('cotizaciones').select('id').eq('id', pedida.data.id);
    expect(vistaTienda.data).toHaveLength(1);

    const vistaOtro = await deOtro.from('cotizaciones').select('id').eq('id', pedida.data.id);
    expect(vistaOtro.error).toBeNull();
    expect(vistaOtro.data).toEqual([]);

    const anon = await anonimo().from('cotizaciones').select('id').eq('id', pedida.data.id);
    expect(anon.error).not.toBeNull();
  });

  it('las ofertas de una necesidad ajena no las ve nadie más que su autor', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 2500);

    const deAutor = await sesionDe(autor);
    const deOtro = await sesionDe(await usuarioNuevo());
    const delAutor = await deAutor.from('cotizaciones').select('id').eq('necesidad_id', necesidad.id);
    expect(delAutor.data!.map((c) => c.id)).toEqual([oferta.data.id]);
    const delExtrano = await deOtro.from('cotizaciones').select('id').eq('necesidad_id', necesidad.id);
    expect(delExtrano.data).toEqual([]);
  });
});

describe('una sesión no escribe en las tablas nuevas', () => {
  it('no inserta, cambia ni borra servicios, necesidades ni cotizaciones', async () => {
    const dueno = await usuarioNuevo();
    const tienda = await negocio(dueno);
    const svc = await servicioDe(dueno);
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const cliente = await usuarioNuevo();
    const pedida = await cotizarRaw(cliente, (await servicioDe(dueno, { tipo: 'cotizar' })).id);
    const intruso = await sesionDe(await usuarioNuevo());
    const categoria = await categoriaServicioDePrueba();

    const altaServicio = await intruso.from('servicios').insert({
      negocio_id: tienda,
      categoria_id: categoria,
      titulo: 'Servicio colado',
      tipo_precio: 'cotizar',
    });
    expect(altaServicio.error).not.toBeNull();
    const cambioServicio = await intruso.from('servicios').update({ titulo: 'Robado' }).eq('id', svc.id);
    expect(cambioServicio.error).not.toBeNull();
    const borradoServicio = await intruso.from('servicios').delete().eq('id', svc.id);
    expect(borradoServicio.error).not.toBeNull();
    expect((await fila('servicios', svc.id)).titulo).toBe(svc.titulo);

    const altaNecesidad = await intruso.from('necesidades').insert({
      usuario_id: (await usuarioNuevo()).id,
      categoria_id: categoria,
      titulo: 'Necesidad colada',
    });
    expect(altaNecesidad.error).not.toBeNull();
    const cambioNecesidad = await intruso.from('necesidades').update({ estado: 'cancelada' }).eq('id', necesidad.id);
    expect(cambioNecesidad.error).not.toBeNull();
    const borradoNecesidad = await intruso.from('necesidades').delete().eq('id', necesidad.id);
    expect(borradoNecesidad.error).not.toBeNull();
    expect((await fila('necesidades', necesidad.id)).estado).toBe('abierta');

    const altaCotizacion = await intruso.from('cotizaciones').insert({
      negocio_id: tienda,
      cliente_id: cliente.id,
      servicio_id: svc.id,
    });
    expect(altaCotizacion.error).not.toBeNull();
    const cambioCotizacion = await intruso.from('cotizaciones').update({ precio_usd_centavos: 1 }).eq('id', pedida.data.id);
    expect(cambioCotizacion.error).not.toBeNull();
    const borradoCotizacion = await intruso.from('cotizaciones').delete().eq('id', pedida.data.id);
    expect(borradoCotizacion.error).not.toBeNull();
    expect((await fila('cotizaciones', pedida.data.id)).precio_usd_centavos).toBeNull();
  });

  it('ninguna función nueva se ejecuta desde una sesión: permiso denegado (42501)', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'cotizar' });
    const cliente = await usuarioNuevo();
    const pedida = await cotizarRaw(cliente, svc.id);
    const orden = await contratar(cliente, (await servicioDe(dueno)).id);
    const necesidad = await necesidadDe(cliente);
    const categoria = await categoriaServicioDePrueba();
    const sesion = await sesionDe(cliente);
    const llamadas: [string, Record<string, unknown>][] = [
      ['guardar_servicio', { p_usuario: cliente.id, p_servicio: null, p_categoria: categoria, p_titulo: 'Servicio', p_descripcion: '', p_zona: '', p_tipo_precio: 'cotizar', p_precio: null, p_unidad: null, p_activo: true, p_fotos: [] }],
      ['ocultar_servicio', { p_servicio: svc.id, p_actor: cliente.id, p_oculto: true }],
      ['publicar_necesidad', { p_usuario: cliente.id, p_categoria: categoria, p_titulo: 'Necesidad propia', p_descripcion: '', p_zona: '', p_presupuesto: null }],
      ['cancelar_necesidad', { p_necesidad: necesidad.id, p_usuario: cliente.id }],
      ['ocultar_necesidad', { p_necesidad: necesidad.id, p_actor: cliente.id, p_oculta: true }],
      ['vencer_necesidades', {}],
      ['solicitar_cotizacion', { p_cliente: cliente.id, p_servicio: svc.id, p_descripcion: 'Quiero cotizar esto.' }],
      ['responder_cotizacion', { p_cotizacion: pedida.data.id, p_actor: cliente.id, p_precio: 100, p_mensaje: '' }],
      ['ofertar', { p_usuario: cliente.id, p_necesidad: necesidad.id, p_precio: 100, p_mensaje: '' }],
      ['retirar_cotizacion', { p_cotizacion: pedida.data.id, p_actor: cliente.id }],
      ['rechazar_cotizacion', { p_cotizacion: pedida.data.id, p_actor: cliente.id }],
      ['aceptar_cotizacion', { p_cotizacion: pedida.data.id, p_actor: cliente.id, p_cotizacion_btc: 100000 }],
      ['contratar_servicio', { p_cliente: cliente.id, p_servicio: svc.id, p_nota: '', p_clave: `colado-${sufijo()}`, p_cotizacion_btc: 100000 }],
      ['marcar_hecha', { p_orden: orden.id, p_actor: cliente.id }],
      ['cancelar_orden', { p_orden: orden.id, p_actor: cliente.id, p_motivo: 'Ya no lo necesito.' }],
      ['registrar_cobro_servicio', { p_orden: orden.id, p_proveedor: 'falso', p_referencia: 'colado', p_bolt11: null, p_destino: null, p_verificar_url: null, p_expira_en: new Date(Date.now() + 60_000).toISOString(), p_cotizacion_btc: 100000 }],
    ];
    for (const [nombre, args] of llamadas) {
      const { error } = await sesion.rpc(nombre, args);
      expect(error?.code, nombre).toBe('42501');
    }
  });

  it('una sesión no lee codigo_entrega, pero sí las columnas nuevas de su orden', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno);
    const cliente = await usuarioNuevo();
    const orden = await contratar(cliente, svc.id);
    const sesion = await sesionDe(cliente);

    const codigo = await sesion.from('ordenes').select('codigo_entrega').eq('id', orden.id);
    expect(codigo.error).not.toBeNull();

    const nuevas = await sesion.from('ordenes').select('tipo, hecha_en, cancelada_en, motivo_cancelacion').eq('id', orden.id);
    expect(nuevas.error).toBeNull();
    expect(nuevas.data).toEqual([{ tipo: 'servicio', hecha_en: null, cancelada_en: null, motivo_cancelacion: null }]);
  });
});

describe('lo que ve un anónimo y un extraño', () => {
  it('anónimos leen servicios visibles y necesidades abiertas, no las ocultas, pausadas, suspendidas ni cerradas', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const visible = await servicioDe(dueno, { titulo: `Visible ${sufijo()}` });
    const oculto = await servicioDe(dueno, { titulo: `Oculto ${sufijo()}` });
    await ocultarServicio(oculto.id, true);
    const pausado = await servicioDe(dueno, { titulo: `Pausado ${sufijo()}`, activo: false });

    const autor = await usuarioNuevo();
    const abierta = await necesidadDe(autor, { titulo: `Abierta ${sufijo()}` });
    const oculta = await necesidadDe(autor, { titulo: `Oculta ${sufijo()}` });
    await ocultarNecesidad(oculta.id, true);
    const cancelada = await necesidadDe(autor, { titulo: `Cancelada ${sufijo()}` });
    await servicio().rpc('cancelar_necesidad', { p_necesidad: cancelada.id, p_usuario: autor.id });

    const anon = anonimo();
    const servicios = await anon.from('servicios').select('id').in('id', [visible.id, oculto.id, pausado.id]);
    expect(servicios.error).toBeNull();
    expect(servicios.data!.map((r) => r.id)).toEqual([visible.id]);

    const necesidades = await anon.from('necesidades').select('id').in('id', [abierta.id, oculta.id, cancelada.id]);
    expect(necesidades.error).toBeNull();
    expect(necesidades.data!.map((r) => r.id)).toEqual([abierta.id]);
  });

  it('un extraño no ve una necesidad oculta; su autor sí', async () => {
    const autor = await usuarioNuevo();
    const oculta = await necesidadDe(autor);
    await ocultarNecesidad(oculta.id, true);

    const extrano = await sesionDe(await usuarioNuevo());
    const deExtrano = await extrano.from('necesidades').select('id').eq('id', oculta.id);
    expect(deExtrano.data).toEqual([]);

    const deAutor = await sesionDe(autor);
    const propia = await deAutor.from('necesidades').select('id').eq('id', oculta.id);
    expect(propia.data).toHaveLength(1);
  });

  it('el aviso de cotización trae su ruta, y solo lo lee quien lo recibe', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'cotizar' });
    const cliente = await usuarioNuevo();
    await cotizarRaw(cliente, svc.id);

    const avisos = await avisosDeUsuario(dueno, 'cotizacion.solicitada');
    expect(avisos).toHaveLength(1);

    const deTienda = await sesionDe(dueno);
    const propio = await deTienda.from('avisos').select('ruta').eq('id', avisos[0].id);
    expect(propio.error).toBeNull();
    expect(propio.data).toEqual([{ ruta: '/mi-negocio/cotizaciones' }]);

    const deOtro = await sesionDe(await usuarioNuevo());
    const ajeno = await deOtro.from('avisos').select('ruta').eq('id', avisos[0].id);
    expect(ajeno.data).toEqual([]);
  });

  it('el cliente no puede responder la cotización en nombre de la tienda', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'cotizar' });
    const cliente = await usuarioNuevo();
    const pedida = await cotizarRaw(cliente, svc.id);
    const r = await responderRaw(pedida.data.id, cliente, 1000);
    expect(codigoDe(r.error)).toBe('NO_PERMITIDO');
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { avisosDeUsuario, categoriaServicioDePrueba, codigoDe, fila, limpiar, limpiarTablon, necesidadDe, negocio, ocultarNecesidad, ofertarRaw, servicio, suspenderNegocio, usuarioNuevo } from './ayuda';

// The board: needs, offers, and what happens when a need closes, expires or is hidden.

afterAll(async () => {
  await limpiarTablon();
  await limpiar();
});

const DIA_MS = 24 * 3600_000;

describe('publicar y cancelar necesidades', () => {
  it('cualquier cuenta publica una necesidad abierta, sin presupuesto si no lo pone, que vence en 14 días', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor, { presupuesto: null });
    expect(necesidad.estado).toBe('abierta');
    expect(necesidad.presupuesto_usd_centavos).toBeNull();
    expect(necesidad.oculta).toBe(false);

    const dias = (new Date(necesidad.vence_en).getTime() - new Date(necesidad.creada_en).getTime()) / DIA_MS;
    expect(dias).toBeGreaterThan(13.9);
    expect(dias).toBeLessThan(14.1);
  });

  it('título corto, presupuesto cero o categoría inexistente son DATOS_INVALIDOS', async () => {
    const autor = await usuarioNuevo();
    const base = {
      p_usuario: autor.id,
      p_categoria: await categoriaServicioDePrueba(),
      p_titulo: 'Necesito ayuda',
      p_descripcion: '',
      p_zona: 'Suchitoto, Cuscatlán',
      p_presupuesto: 1000,
    };
    const corto = await servicio().rpc('publicar_necesidad', { ...base, p_titulo: 'ab' });
    expect(codigoDe(corto.error)).toBe('DATOS_INVALIDOS');

    const cero = await servicio().rpc('publicar_necesidad', { ...base, p_presupuesto: 0 });
    expect(codigoDe(cero.error)).toBe('DATOS_INVALIDOS');

    const categoria = await servicio().rpc('publicar_necesidad', { ...base, p_categoria: 999999 });
    expect(codigoDe(categoria.error)).toBe('DATOS_INVALIDOS');
  });

  it('solo quien publicó la cancela, y solo mientras está abierta', async () => {
    const autor = await usuarioNuevo();
    const otro = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);

    const ajena = await servicio().rpc('cancelar_necesidad', { p_necesidad: necesidad.id, p_usuario: otro.id });
    expect(codigoDe(ajena.error)).toBe('NO_PERMITIDO');

    const propia = await servicio().rpc('cancelar_necesidad', { p_necesidad: necesidad.id, p_usuario: autor.id });
    expect(propia.error).toBeNull();
    expect(propia.data.estado).toBe('cancelada');

    const otra = await servicio().rpc('cancelar_necesidad', { p_necesidad: necesidad.id, p_usuario: autor.id });
    expect(codigoDe(otra.error)).toBe('ESTADO_INVALIDO');
  });

  it('cancelar la necesidad rechaza las ofertas que seguían abiertas', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const primero = await usuarioNuevo();
    await negocio(primero);
    const segundo = await usuarioNuevo();
    await negocio(segundo);
    const oferta1 = await ofertarRaw(primero, necesidad.id, 4000);
    const oferta2 = await ofertarRaw(segundo, necesidad.id, 3500);
    expect(oferta1.error).toBeNull();
    expect(oferta2.error).toBeNull();

    await servicio().rpc('cancelar_necesidad', { p_necesidad: necesidad.id, p_usuario: autor.id });

    expect((await fila('cotizaciones', oferta1.data.id)).estado).toBe('rechazada');
    expect((await fila('cotizaciones', oferta2.data.id)).estado).toBe('rechazada');
  });
});

describe('ofertar en una necesidad', () => {
  it('un negocio aprobado oferta; una sola oferta por negocio; retirarla permite reemplazarla', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);

    const primera = await ofertarRaw(dueno, necesidad.id, 4000, 'Puedo el sábado.');
    expect(primera.error).toBeNull();
    expect(primera.data.estado).toBe('ofrecida');
    expect(primera.data.precio_usd_centavos).toBe(4000);
    expect(primera.data.cliente_id).toBe(autor.id);

    const repetida = await ofertarRaw(dueno, necesidad.id, 4500);
    expect(codigoDe(repetida.error)).toBe('ESTADO_INVALIDO');

    const avisos = await avisosDeUsuario(autor, 'oferta.nueva');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].ruta).toBe(`/necesito/${necesidad.id}`);

    const retirada = await servicio().rpc('retirar_cotizacion', { p_cotizacion: primera.data.id, p_actor: dueno.id });
    expect(retirada.data.estado).toBe('retirada');

    const reemplazo = await ofertarRaw(dueno, necesidad.id, 4500, 'Mejor precio.');
    expect(reemplazo.error).toBeNull();
    expect(reemplazo.data.id).toBe(primera.data.id);
    expect(reemplazo.data.estado).toBe('ofrecida');
    expect(reemplazo.data.precio_usd_centavos).toBe(4500);
  });

  it('quien publicó no oferta en su propia necesidad, y un negocio pendiente no oferta', async () => {
    const autor = await usuarioNuevo();
    await negocio(autor);
    const necesidad = await necesidadDe(autor);
    const propia = await ofertarRaw(autor, necesidad.id, 1000);
    expect(codigoDe(propia.error)).toBe('NO_PERMITIDO');

    const pendiente = await usuarioNuevo();
    await negocio(pendiente, { aprobar: false });
    const otra = await necesidadDe(await usuarioNuevo());
    const r = await ofertarRaw(pendiente, otra.id, 1000);
    expect(codigoDe(r.error)).toBe('NO_PERMITIDO');
  });

  it('precio cero, necesidad inexistente y necesidad oculta: DATOS_INVALIDOS, NO_ENCONTRADA, NO_ENCONTRADA', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);

    const cero = await ofertarRaw(dueno, necesidad.id, 0);
    expect(codigoDe(cero.error)).toBe('DATOS_INVALIDOS');

    const inexistente = await ofertarRaw(dueno, '00000000-0000-4000-8000-000000000000', 1000);
    expect(codigoDe(inexistente.error)).toBe('NO_ENCONTRADA');

    await ocultarNecesidad(necesidad.id, true);
    const oculta = await ofertarRaw(dueno, necesidad.id, 1000);
    expect(codigoDe(oculta.error)).toBe('NO_ENCONTRADA');
  });

  it('una necesidad pasada de plazo no recibe ofertas, y vencer_necesidades la cierra con sus ofertas', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 2500);
    expect(oferta.error).toBeNull();

    await servicio()
      .from('necesidades')
      .update({ vence_en: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', necesidad.id);

    const otroDueno = await usuarioNuevo();
    await negocio(otroDueno);
    const tarde = await ofertarRaw(otroDueno, necesidad.id, 2000);
    expect(codigoDe(tarde.error)).toBe('ESTADO_INVALIDO');

    const { data: vencidas, error } = await servicio().rpc('vencer_necesidades');
    expect(error).toBeNull();
    expect(vencidas).toBeGreaterThanOrEqual(1);
    expect((await fila('necesidades', necesidad.id)).estado).toBe('vencida');
    expect((await fila('cotizaciones', oferta.data.id)).estado).toBe('vencida');
  });

  it('una oferta rechazada por el cliente no vuelve a ofertarse en esa necesidad', async () => {
    const autor = await usuarioNuevo();
    const necesidad = await necesidadDe(autor);
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const oferta = await ofertarRaw(dueno, necesidad.id, 2500);

    const rechazo = await servicio().rpc('rechazar_cotizacion', { p_cotizacion: oferta.data.id, p_actor: autor.id });
    expect(rechazo.data.estado).toBe('rechazada');

    const otra = await ofertarRaw(dueno, necesidad.id, 2400);
    expect(codigoDe(otra.error)).toBe('ESTADO_INVALIDO');
  });

  it('un negocio suspendido no puede ofertar', async () => {
    const dueno = await usuarioNuevo();
    const tienda = await negocio(dueno);
    await suspenderNegocio(tienda);
    const necesidad = await necesidadDe(await usuarioNuevo());
    const r = await ofertarRaw(dueno, necesidad.id, 1000);
    expect(codigoDe(r.error)).toBe('NO_PERMITIDO');
  });
});

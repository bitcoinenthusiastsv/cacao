import { describe, expect, it } from 'vitest';
import { anonimo, codigoDe, servicio, sesionDe, sufijo, usuarioNuevo } from './ayuda';

// Shared funnel events: one row per event, session and object per hour, the funnel counts, and the
// security of the new tables and functions.

// A session id the browser keeps for one visit: 8 to 64 characters.
function sesionNueva(): string {
  return `s-${sufijo()}${sufijo()}`;
}

function registrarRaw(
  sitio: string,
  nombre: string,
  sesion: string,
  opciones: { objeto?: string | null; usuario?: string | null; valor?: number | null; ruta?: string; sesionSinValidar?: string } = {},
) {
  return servicio().rpc('registrar_evento', {
    p_sitio: sitio,
    p_nombre: nombre,
    p_sesion: opciones.sesionSinValidar ?? sesion,
    p_usuario: opciones.usuario ?? null,
    p_ruta: opciones.ruta ?? '/historias/ejemplo',
    p_objeto: opciones.objeto ?? null,
    p_valor: opciones.valor ?? null,
  });
}

async function filasDe(sesion: string): Promise<{ objeto: string | null; valor_usd_centavos: number | null; usuario_id: string | null }[]> {
  const { data, error } = await servicio().from('eventos').select('objeto, valor_usd_centavos, usuario_id').eq('sesion', sesion);
  if (error) throw error;
  return data ?? [];
}

describe('registrar_evento', () => {
  it('rechaza un sitio o un evento que no están en la lista', async () => {
    const sesion = sesionNueva();
    const sitioMalo = await registrarRaw('otro', 'vista_historia', sesion);
    expect(codigoDe(sitioMalo.error)).toBe('DATOS_INVALIDOS');
    const eventoMalo = await registrarRaw('media', 'vista_inventada', sesion);
    expect(codigoDe(eventoMalo.error)).toBe('DATOS_INVALIDOS');
    expect(await filasDe(sesion)).toEqual([]);
  });

  it('un evento repetido dentro de la misma hora cuenta una sola vez', async () => {
    const sesion = sesionNueva();
    for (let i = 0; i < 3; i++) {
      const { error } = await registrarRaw('media', 'vista_historia', sesion, { objeto: 'historia-a' });
      expect(error).toBeNull();
    }
    expect(await filasDe(sesion)).toHaveLength(1);
  });

  it('un objeto distinto o una sesión distinta sí cuenta como otro evento', async () => {
    const sesion = sesionNueva();
    await registrarRaw('media', 'vista_historia', sesion, { objeto: 'historia-a' });
    await registrarRaw('media', 'vista_historia', sesion, { objeto: 'historia-b' });
    expect(await filasDe(sesion)).toHaveLength(2);

    const otra = sesionNueva();
    await registrarRaw('media', 'vista_historia', otra, { objeto: 'historia-a' });
    expect(await filasDe(otra)).toHaveLength(1);
  });

  it('un objeto vacío y uno nulo son el mismo objeto', async () => {
    const sesion = sesionNueva();
    await registrarRaw('market', 'vista_producto', sesion, { objeto: null });
    await registrarRaw('market', 'vista_producto', sesion, { objeto: '   ' });
    expect(await filasDe(sesion)).toHaveLength(1);
  });

  it('llamadas simultáneas del mismo evento dejan una sola fila', async () => {
    const sesion = sesionNueva();
    const resultados = await Promise.all(
      [1, 2, 3, 4, 5].map(() => registrarRaw('pay', 'vio_cotizacion', sesion, { objeto: 'envio' })),
    );
    expect(resultados.every((r) => r.error === null)).toBe(true);
    expect(await filasDe(sesion)).toHaveLength(1);
  });

  it('en otra hora el mismo evento sí se registra otra vez', async () => {
    const sesion = sesionNueva();
    const horaAnterior = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - 3_600_000).toISOString();
    const { error: errorAlta } = await servicio().from('eventos').insert({
      sitio: 'media',
      nombre: 'vista_historia',
      sesion,
      ruta: '/historias/ejemplo',
      objeto: 'historia-a',
      hora: horaAnterior,
    });
    expect(errorAlta).toBeNull();

    const { error } = await registrarRaw('media', 'vista_historia', sesion, { objeto: 'historia-a' });
    expect(error).toBeNull();
    expect(await filasDe(sesion)).toHaveLength(2);
  });

  it('guarda el valor, y un usuario que no existe queda sin usuario', async () => {
    const sesion = sesionNueva();
    const { error } = await registrarRaw('market', 'pago', sesion, {
      objeto: 'orden-1',
      valor: 350,
      usuario: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const [fila] = await filasDe(sesion);
    expect(fila.valor_usd_centavos).toBe(350);
    expect(fila.usuario_id).toBeNull();
  });

  it('valida la sesión, el objeto y el valor', async () => {
    const sesion = sesionNueva();
    const sesionCorta = await registrarRaw('media', 'vista_historia', sesion, { sesionSinValidar: 'corta' });
    expect(codigoDe(sesionCorta.error)).toBe('DATOS_INVALIDOS');
    const objetoLargo = await registrarRaw('media', 'vista_historia', sesion, { objeto: 'x'.repeat(81) });
    expect(codigoDe(objetoLargo.error)).toBe('DATOS_INVALIDOS');
    const valorNegativo = await registrarRaw('market', 'pago', sesion, { valor: -1 });
    expect(codigoDe(valorNegativo.error)).toBe('DATOS_INVALIDOS');
  });
});

describe('embudo', () => {
  it('cuenta sesiones y eventos por paso, en orden, solo dentro del rango', async () => {
    const desde = new Date();
    const s1 = sesionNueva();
    const s2 = sesionNueva();
    const s3 = sesionNueva();

    await registrarRaw('media', 'vista_historia', s1, { objeto: 'h1' });
    await registrarRaw('media', 'vio_muro', s1, { objeto: 'h1' });
    await registrarRaw('media', 'pago', s1, { objeto: 'h1', valor: 350 });
    await registrarRaw('media', 'vista_historia', s1, { objeto: 'h1' });
    await registrarRaw('media', 'vista_historia', s2, { objeto: 'h2' });
    await registrarRaw('media', 'vio_muro', s2, { objeto: 'h2' });
    await registrarRaw('media', 'vista_historia', s3, { objeto: 'h3' });
    // Another site stays out of the media funnel.
    await registrarRaw('pay', 'vio_cotizacion', s3, { objeto: 'envio' });

    const hasta = new Date(Date.now() + 60_000);
    const { data, error } = await servicio().rpc('embudo', {
      p_sitio: 'media',
      p_desde: desde.toISOString(),
      p_hasta: hasta.toISOString(),
    });
    expect(error).toBeNull();
    expect(data.map((f: { nombre: string }) => f.nombre)).toEqual([
      'vista_historia',
      'vio_muro',
      'creo_cobro',
      'pago',
      'leyo_completa',
    ]);
    expect(data[0]).toMatchObject({ etiqueta: 'Abrió una historia de pago', orden: 1, sesiones: 3, eventos: 3, valor_usd_centavos: 0 });
    expect(data[1]).toMatchObject({ orden: 2, sesiones: 2, eventos: 2 });
    expect(data[2]).toMatchObject({ orden: 3, sesiones: 0, eventos: 0 });
    expect(data[3]).toMatchObject({ etiqueta: 'Pagó', orden: 4, sesiones: 1, eventos: 1, valor_usd_centavos: 350 });
    expect(data[4]).toMatchObject({ orden: 5, sesiones: 0, eventos: 0 });

    const otroSitio = await servicio().rpc('embudo', {
      p_sitio: 'pay',
      p_desde: desde.toISOString(),
      p_hasta: hasta.toISOString(),
    });
    expect(otroSitio.data.find((f: { nombre: string }) => f.nombre === 'vio_cotizacion')).toMatchObject({ sesiones: 1, eventos: 1 });
  });
});

describe('lo que ve una sesión y un anónimo', () => {
  it('no leen ni escriben las tablas de eventos', async () => {
    const sesion = await sesionDe(await usuarioNuevo());
    const clientes = [sesion, anonimo()];
    for (const cliente of clientes) {
      expect((await cliente.from('eventos').select('id')).error).not.toBeNull();
      expect((await cliente.from('eventos_permitidos').select('sitio')).error).not.toBeNull();
      const alta = await cliente.from('eventos').insert({
        sitio: 'media',
        nombre: 'vista_historia',
        sesion: sesionNueva(),
        ruta: '/colado',
        hora: new Date().toISOString(),
      });
      expect(alta.error).not.toBeNull();
      const lista = await cliente.from('eventos_permitidos').insert({ sitio: 'media', nombre: 'colado', orden: 9, etiqueta: 'Colado' });
      expect(lista.error).not.toBeNull();
    }
  });

  it('no ejecutan registrar_evento ni embudo: permiso denegado (42501)', async () => {
    const sesion = await sesionDe(await usuarioNuevo());
    const clientes = [sesion, anonimo()];
    for (const cliente of clientes) {
      const registro = await cliente.rpc('registrar_evento', {
        p_sitio: 'media',
        p_nombre: 'vista_historia',
        p_sesion: sesionNueva(),
        p_usuario: null,
        p_ruta: '/colado',
        p_objeto: null,
        p_valor: null,
      });
      expect(registro.error?.code).toBe('42501');
      const funnel = await cliente.rpc('embudo', {
        p_sitio: 'media',
        p_desde: new Date(0).toISOString(),
        p_hasta: new Date().toISOString(),
      });
      expect(funnel.error?.code).toBe('42501');
    }
  });
});

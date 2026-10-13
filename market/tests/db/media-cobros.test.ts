import { describe, expect, it } from 'vitest';
import { anonimo, codigoDe, fila, Fila, servicio, sesionDe, sufijo, usuarioNuevo } from './ayuda';

// Cacao Media: readers, invoices for paid stories, access, the administrator summary, and security.

const FACTURA = /^lnsim1[0-9a-f]{40}$/;

async function lectorNuevo(): Promise<string> {
  const { data, error } = await servicio().rpc('media_lector', { p_lector: null });
  if (error) throw error;
  return data.id as string;
}

function crearRaw(lector: string, slug: string, opciones: { sats?: number; cotizacion?: number; segundos?: number; titulo?: string } = {}) {
  return servicio().rpc('media_crear_cobro', {
    p_lector: lector,
    p_slug: slug,
    p_titulo: opciones.titulo ?? `Historia ${slug}`,
    p_precio_sats: opciones.sats ?? 1250,
    p_cotizacion: opciones.cotizacion ?? 100000,
    p_segundos: opciones.segundos ?? 300,
  });
}

// A new invoice; fails the test if it is refused.
async function crear(lector: string, slug: string, opciones?: { sats?: number; cotizacion?: number }): Promise<Fila> {
  const { data, error } = await crearRaw(lector, slug, opciones);
  if (error) throw error;
  return data;
}

function pagarRaw(cobro: string) {
  return servicio().rpc('media_pagar_cobro', { p_cobro: cobro });
}

// Moves an invoice's deadline into the past, as if the reader waited too long.
async function vencerAhora(cobro: string): Promise<void> {
  const { error } = await servicio()
    .from('media_cobros')
    .update({ expira_en: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', cobro);
  if (error) throw error;
}

async function accesosDe(lector: string, slug: string): Promise<Fila[]> {
  const { data, error } = await servicio().from('media_accesos').select('*').eq('lector_id', lector).eq('slug', slug);
  if (error) throw error;
  return data ?? [];
}

function historiaNueva(): string {
  return `historia-${sufijo()}`;
}

describe('lectores', () => {
  it('sin identificador crea un lector nuevo', async () => {
    const { data, error } = await servicio().rpc('media_lector', { p_lector: null });
    expect(error).toBeNull();
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.visto_en).not.toBeNull();
  });

  it('con un identificador conocido conserva el lector y actualiza visto_en', async () => {
    const id = await lectorNuevo();
    const antes = (await fila('media_lectores', id)).visto_en;
    await new Promise((resolver) => setTimeout(resolver, 20));
    const { data, error } = await servicio().rpc('media_lector', { p_lector: id });
    expect(error).toBeNull();
    expect(data.id).toBe(id);
    expect(new Date(data.visto_en).getTime()).toBeGreaterThan(new Date(antes).getTime());
  });

  it('con un identificador desconocido crea un lector nuevo con otro id', async () => {
    const desconocido = crypto.randomUUID();
    const { data, error } = await servicio().rpc('media_lector', { p_lector: desconocido });
    expect(error).toBeNull();
    expect(data.id).not.toBe(desconocido);
  });
});

describe('crear una factura', () => {
  it('pide sats y da dólares redondeados hacia arriba, con plazo de cinco minutos', async () => {
    const lector = await lectorNuevo();
    const inicio = Date.now();
    const cobro = await crear(lector, historiaNueva(), { sats: 1250, cotizacion: 100000 });

    expect(cobro.estado).toBe('pendiente');
    expect(cobro.factura).toMatch(FACTURA);
    expect(cobro.precio_sats).toBe(1250);
    // 1,250 sats at 100000 USD per BTC is $1.25.
    expect(cobro.precio_usd_centavos).toBe(125);
    expect(Number(cobro.cotizacion_usd_btc)).toBe(100000);
    const plazo = new Date(cobro.expira_en).getTime() - inicio;
    expect(plazo).toBeGreaterThan(299_000);
    expect(plazo).toBeLessThan(310_000);
  });

  it('un sat es un centavo: los centavos siempre se redondean hacia arriba', async () => {
    const lector = await lectorNuevo();
    const cobro = await crear(lector, historiaNueva(), { sats: 1, cotizacion: 100000 });
    expect(cobro.precio_usd_centavos).toBe(1);
  });

  it('reutiliza la factura pendiente viva en vez de crear otra', async () => {
    const lector = await lectorNuevo();
    const historia = historiaNueva();
    const primera = await crear(lector, historia);
    const segunda = await crear(lector, historia);
    expect(segunda.id).toBe(primera.id);
    expect(segunda.factura).toBe(primera.factura);
  });

  it('una factura vencida se cierra y se hace otra', async () => {
    const lector = await lectorNuevo();
    const historia = historiaNueva();
    const primera = await crear(lector, historia);
    await vencerAhora(primera.id);

    const nueva = await crear(lector, historia);
    expect(nueva.id).not.toBe(primera.id);
    expect(nueva.estado).toBe('pendiente');
    const vieja = await fila('media_cobros', primera.id);
    expect(vieja.estado).toBe('vencida');
    expect(vieja.cerrada_en).not.toBeNull();
  });

  it('un lector que ya tiene acceso no recibe otra factura para la misma historia', async () => {
    const lector = await lectorNuevo();
    const historia = historiaNueva();
    const cobro = await crear(lector, historia);
    await pagarRaw(cobro.id);

    const { error } = await crearRaw(lector, historia);
    expect(codigoDe(error)).toBe('ESTADO_INVALIDO');
    expect(error?.message).toContain('Ya tenés acceso a esta historia.');
  });

  it('rechaza un título vacío, un precio de cero y un plazo que no sirve', async () => {
    const lector = await lectorNuevo();
    const sinTitulo = await crearRaw(lector, historiaNueva(), { titulo: '   ' });
    expect(codigoDe(sinTitulo.error)).toBe('DATOS_INVALIDOS');
    const sinPrecio = await crearRaw(lector, historiaNueva(), { sats: 0 });
    expect(codigoDe(sinPrecio.error)).toBe('DATOS_INVALIDOS');
    const sinPlazo = await crearRaw(lector, historiaNueva(), { segundos: 0 });
    expect(codigoDe(sinPlazo.error)).toBe('DATOS_INVALIDOS');
  });

  it('un lector que no existe recibe NO_ENCONTRADA', async () => {
    const { error } = await crearRaw(crypto.randomUUID(), historiaNueva());
    expect(codigoDe(error)).toBe('NO_ENCONTRADA');
  });
});

describe('pagar una factura', () => {
  it('pagar da acceso a la historia, y pagar otra vez no da un segundo acceso', async () => {
    const lector = await lectorNuevo();
    const historia = historiaNueva();
    const cobro = await crear(lector, historia);

    const pagada = await pagarRaw(cobro.id);
    expect(pagada.error).toBeNull();
    expect(pagada.data.estado).toBe('pagada');
    expect(pagada.data.pagada_en).not.toBeNull();
    const accesos = await accesosDe(lector, historia);
    expect(accesos).toHaveLength(1);
    expect(accesos[0].cobro_id).toBe(cobro.id);

    const otraVez = await pagarRaw(cobro.id);
    expect(otraVez.error).toBeNull();
    expect(otraVez.data.id).toBe(cobro.id);
    expect(otraVez.data.estado).toBe('pagada');
    expect(await accesosDe(lector, historia)).toHaveLength(1);
  });

  it('pagar tarde da FUERA_DE_PLAZO, no da acceso, y media_vencer_cobros la marca vencida', async () => {
    const lector = await lectorNuevo();
    const historia = historiaNueva();
    const cobro = await crear(lector, historia);
    await vencerAhora(cobro.id);

    const tarde = await pagarRaw(cobro.id);
    expect(codigoDe(tarde.error)).toBe('FUERA_DE_PLAZO');
    expect(await accesosDe(lector, historia)).toHaveLength(0);

    // The refusal rolls back its own changes, so the sweep is what marks the invoice.
    const barrido = await servicio().rpc('media_vencer_cobros');
    expect(barrido.error).toBeNull();
    expect(barrido.data).toBeGreaterThanOrEqual(1);
    const marcada = await fila('media_cobros', cobro.id);
    expect(marcada.estado).toBe('vencida');
    expect(marcada.cerrada_en).not.toBeNull();
    expect(await accesosDe(lector, historia)).toHaveLength(0);
  });

  it('una factura vencida o fallida ya no se paga', async () => {
    const lector = await lectorNuevo();
    const cobro = await crear(lector, historiaNueva());
    const fallida = await servicio().rpc('media_fallar_cobro', { p_cobro: cobro.id, p_motivo: 'El simulador rechazó el pago.' });
    expect(fallida.error).toBeNull();

    const despues = await pagarRaw(cobro.id);
    expect(codigoDe(despues.error)).toBe('ESTADO_INVALIDO');
    expect((await fila('media_cobros', cobro.id)).estado).toBe('fallida');
  });

  it('fallar solo sirve para una factura pendiente y pide un motivo de 4 a 200 caracteres', async () => {
    const lector = await lectorNuevo();
    const cobro = await crear(lector, historiaNueva());

    const corto = await servicio().rpc('media_fallar_cobro', { p_cobro: cobro.id, p_motivo: 'no' });
    expect(codigoDe(corto.error)).toBe('DATOS_INVALIDOS');
    expect((await fila('media_cobros', cobro.id)).estado).toBe('pendiente');

    const bien = await servicio().rpc('media_fallar_cobro', { p_cobro: cobro.id, p_motivo: 'El pago no llegó a tiempo.' });
    expect(bien.error).toBeNull();
    expect(bien.data.estado).toBe('fallida');
    expect(bien.data.motivo).toBe('El pago no llegó a tiempo.');

    const otraVez = await servicio().rpc('media_fallar_cobro', { p_cobro: cobro.id, p_motivo: 'Otra vez el mismo error.' });
    expect(codigoDe(otraVez.error)).toBe('ESTADO_INVALIDO');
  });

  it('una factura que no existe recibe NO_ENCONTRADA', async () => {
    const { error } = await pagarRaw(crypto.randomUUID());
    expect(codigoDe(error)).toBe('NO_ENCONTRADA');
  });
});

describe('resumen para el administrador', () => {
  it('suma por historia las facturas del rango: pagadas, vencidas, fallidas y sats cobrados', async () => {
    const desde = new Date().toISOString();
    const historia = historiaNueva();
    const pagada = await crear(await lectorNuevo(), historia, { sats: 1250, cotizacion: 100000 });
    await pagarRaw(pagada.id);
    const fallida = await crear(await lectorNuevo(), historia, { sats: 2000 });
    await servicio().rpc('media_fallar_cobro', { p_cobro: fallida.id, p_motivo: 'El pago no llegó a tiempo.' });
    const vencida = await crear(await lectorNuevo(), historia, { sats: 500 });
    await vencerAhora(vencida.id);
    await servicio().rpc('media_vencer_cobros');

    const { data, error } = await servicio().rpc('media_resumen', {
      p_desde: desde,
      p_hasta: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(error).toBeNull();
    const fila1 = data.find((r: { slug: string }) => r.slug === historia);
    expect(fila1).toMatchObject({
      cobros: 3,
      pagadas: 1,
      vencidas: 1,
      fallidas: 1,
      sats: 1250,
      usd_centavos: 125,
    });
  });
});

describe('lo que ve una sesión y un anónimo', () => {
  it('no leen ni escriben las tablas de Media', async () => {
    const sesion = await sesionDe(await usuarioNuevo());
    for (const cliente of [sesion, anonimo()]) {
      for (const tabla of ['media_lectores', 'media_cobros', 'media_accesos']) {
        expect((await cliente.from(tabla).select('*')).error, tabla).not.toBeNull();
      }
      const alta = await cliente.from('media_lectores').insert({});
      expect(alta.error).not.toBeNull();
      const cambio = await cliente.from('media_cobros').update({ estado: 'pagada' }).eq('estado', 'pendiente');
      expect(cambio.error).not.toBeNull();
    }
  });

  it('no ejecutan ninguna función de Media: permiso denegado (42501)', async () => {
    const sesion = await sesionDe(await usuarioNuevo());
    const lector = crypto.randomUUID();
    const llamadas: [string, Record<string, unknown>][] = [
      ['media_lector', { p_lector: null }],
      ['media_crear_cobro', { p_lector: lector, p_slug: 'x', p_titulo: 'x', p_precio_sats: 1, p_cotizacion: 1, p_segundos: 60 }],
      ['media_pagar_cobro', { p_cobro: lector }],
      ['media_fallar_cobro', { p_cobro: lector, p_motivo: 'motivo' }],
      ['media_vencer_cobros', {}],
      ['media_resumen', { p_desde: new Date(0).toISOString(), p_hasta: new Date().toISOString() }],
    ];
    for (const cliente of [sesion, anonimo()]) {
      for (const [nombre, args] of llamadas) {
        const { error } = await cliente.rpc(nombre, args);
        expect(error?.code, nombre).toBe('42501');
      }
    }
  });
});

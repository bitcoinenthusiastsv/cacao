// Asks for an invoice to read one paid story. The price and title come from the server's own data.
// A reader who already paid gets the pass straight away.
import type { APIContext } from 'astro';
import { bd, hayBase } from '../../../lib/servidor/bd';
import {
  historiaDePago,
  respuestaError,
  SEGUNDOS_PARA_PAGAR,
  sinGuardar,
  tieneAcceso,
  tokenDeAcceso,
  vistaCobro,
  type Cobro,
} from '../../../lib/servidor/cobros';
import { lectorDe } from '../../../lib/servidor/lector';
import { registrarEvento } from '../../../lib/servidor/eventos';
import { cotizacionUsdBtc } from '../../../lib/servidor/precio';

export const prerender = false;

const SIN_BASE = 'Los pagos no están disponibles en este momento.';

export async function POST(context: APIContext) {
  let slug: unknown;
  try {
    ({ slug } = await context.request.json());
  } catch {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400, headers: sinGuardar });
  }
  const historia = await historiaDePago(slug);
  if (!historia) {
    return Response.json({ error: 'Esa historia no existe o es gratis.' }, { status: 404, headers: sinGuardar });
  }
  if (!hayBase()) {
    return Response.json({ error: SIN_BASE }, { status: 503, headers: sinGuardar });
  }

  let lector: string;
  try {
    lector = await lectorDe(context);
    if (await tieneAcceso(lector, historia.slug)) {
      return Response.json({ estado: 'pagada', token: tokenDeAcceso(historia.slug).token }, { headers: sinGuardar });
    }
  } catch (error) {
    return respuestaError(error);
  }

  // The invoice needs a BTC price: the database stores the dollar value and refuses zero.
  let cotizacion: number;
  try {
    cotizacion = await cotizacionUsdBtc();
  } catch (error) {
    console.error(error);
    const mensaje = error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, '') : 'No pudimos consultar el precio.';
    return Response.json({ error: mensaje }, { status: 503, headers: sinGuardar });
  }

  const { data, error } = await bd().rpc('media_crear_cobro', {
    p_lector: lector,
    p_slug: historia.slug,
    p_titulo: historia.titulo,
    p_precio_sats: historia.precioSats,
    p_cotizacion: cotizacion,
    p_segundos: SEGUNDOS_PARA_PAGAR,
  });
  if (error) return respuestaError(error);

  const cobro = (Array.isArray(data) ? data[0] : data) as Cobro;
  await registrarEvento({
    sesion: lector,
    nombre: 'creo_cobro',
    ruta: `/historias/${historia.slug}/`,
    objeto: historia.slug,
  });
  return Response.json(vistaCobro(cobro), { headers: sinGuardar });
}

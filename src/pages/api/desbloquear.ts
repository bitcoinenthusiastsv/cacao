// The 7-day pass for a paid story. It is given only to a reader who already has access (paid
// earlier, from this browser). A first unlock goes through an invoice: see /api/cobro/.
import type { APIContext } from 'astro';
import { hayBase } from '../../lib/servidor/bd';
import {
  historiaDePago,
  precioUsdCentavos,
  respuestaError,
  sinGuardar,
  TEXTO_NO_DISPONIBLE,
  tieneAcceso,
  tokenDeAcceso,
} from '../../lib/servidor/cobros';
import { cerradoDe } from '../../lib/servidor/cerrado';
import { lectorDe } from '../../lib/servidor/lector';

export const prerender = false;

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
    return Response.json({ error: 'Los pagos no están disponibles en este momento.' }, { status: 503, headers: sinGuardar });
  }

  try {
    if ((await cerradoDe(historia.slug)) === null) {
      return Response.json({ error: TEXTO_NO_DISPONIBLE }, { status: 503, headers: sinGuardar });
    }
    const lector = await lectorDe(context);
    if (await tieneAcceso(lector, historia.slug)) {
      const { token, expira } = tokenDeAcceso(historia.slug);
      return Response.json({ token, expira }, { headers: sinGuardar });
    }
  } catch (error) {
    return respuestaError(error);
  }

  // The price is for the gate's dollar line only; null when no BTC price is available.
  return Response.json(
    {
      error: 'Esta historia se desbloquea pagando su factura.',
      precioSats: historia.precioSats,
      precioUsdCentavos: await precioUsdCentavos(historia.precioSats),
    },
    { status: 402, headers: sinGuardar },
  );
}

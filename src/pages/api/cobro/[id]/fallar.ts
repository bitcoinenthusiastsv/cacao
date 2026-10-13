// Simulated failed payment, for the demo only. Real Lightning has no such button: a payment that
// does not arrive simply expires.
import type { APIContext } from 'astro';
import { bd, hayBase } from '../../../../lib/servidor/bd';
import {
  cobroDe,
  modoDemo,
  respuestaError,
  sinGuardar,
  UUID,
  vencerCobros,
} from '../../../../lib/servidor/cobros';
import { cookieLector } from '../../../../lib/servidor/lector';

export const prerender = false;

const MOTIVO = 'El pago simulado no se completó.';

export async function POST(context: APIContext) {
  if (!modoDemo()) {
    return Response.json({ error: 'El pago simulado solo está disponible en modo demo.' }, { status: 403, headers: sinGuardar });
  }
  const id = context.params.id ?? '';
  const lector = cookieLector(context);
  if (!UUID.test(id) || !lector || !hayBase()) {
    return Response.json({ error: 'No encontramos esa factura.' }, { status: 404, headers: sinGuardar });
  }

  try {
    await vencerCobros();
    const propia = await cobroDe(id, lector);
    if (!propia) {
      return Response.json({ error: 'No encontramos esa factura.' }, { status: 404, headers: sinGuardar });
    }
    const { error } = await bd().rpc('media_fallar_cobro', { p_cobro: id, p_motivo: MOTIVO });
    if (error) return respuestaError(error);
    return Response.json({ estado: 'fallida', motivo: MOTIVO }, { headers: sinGuardar });
  } catch (error) {
    return respuestaError(error);
  }
}

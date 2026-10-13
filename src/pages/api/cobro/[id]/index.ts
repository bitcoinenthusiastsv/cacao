// The state of one invoice. Only the reader who owns it gets an answer; anyone else gets 404.
import type { APIContext } from 'astro';
import { hayBase } from '../../../../lib/servidor/bd';
import {
  cobroDe,
  respuestaError,
  sinGuardar,
  tokenDeAcceso,
  UUID,
  vencerCobros,
  vistaCobro,
} from '../../../../lib/servidor/cobros';
import { cookieLector } from '../../../../lib/servidor/lector';

export const prerender = false;

export async function GET(context: APIContext) {
  const id = context.params.id ?? '';
  const lector = cookieLector(context);
  if (!UUID.test(id) || !lector) {
    return Response.json({ error: 'No encontramos esa factura.' }, { status: 404, headers: sinGuardar });
  }
  if (!hayBase()) {
    return Response.json({ error: 'Los pagos no están disponibles en este momento.' }, { status: 503, headers: sinGuardar });
  }

  try {
    // An overdue invoice must read vencida, so the database closes it first.
    await vencerCobros();
    const cobro = await cobroDe(id, lector);
    if (!cobro) {
      return Response.json({ error: 'No encontramos esa factura.' }, { status: 404, headers: sinGuardar });
    }
    const cuerpo: Record<string, unknown> = { ...vistaCobro(cobro) };
    if (cobro.estado === 'pagada') cuerpo.token = tokenDeAcceso(cobro.slug).token;
    if (cobro.estado === 'fallida') cuerpo.motivo = cobro.motivo;
    return Response.json(cuerpo, { headers: sinGuardar });
  } catch (error) {
    return respuestaError(error);
  }
}

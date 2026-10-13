// Simulated payment: with real Lightning the confirmation comes from the payment provider, not the browser.
import type { APIContext } from 'astro';
import { bd, hayBase, leerError } from '../../../../lib/servidor/bd';
import {
  cobroDe,
  modoDemo,
  respuestaError,
  sinGuardar,
  tokenDeAcceso,
  UUID,
  vencerCobros,
} from '../../../../lib/servidor/cobros';
import { registrarEvento } from '../../../../lib/servidor/eventos';
import { cookieLector } from '../../../../lib/servidor/lector';

export const prerender = false;

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
    const propia = await cobroDe(id, lector);
    if (!propia) {
      return Response.json({ error: 'No encontramos esa factura.' }, { status: 404, headers: sinGuardar });
    }
    const { data, error } = await bd().rpc('media_pagar_cobro', { p_cobro: id });
    if (error) {
      // A late payment is refused and the invoice closes: the answer carries the database's sentence.
      if (leerError(error).codigo === 'FUERA_DE_PLAZO') {
        await vencerCobros();
        return Response.json(
          { error: leerError(error).mensaje, estado: 'vencida' },
          { status: 409, headers: sinGuardar },
        );
      }
      return respuestaError(error);
    }
    const pagada = (Array.isArray(data) ? data[0] : data) as { precio_usd_centavos: number };
    await registrarEvento({
      sesion: lector,
      nombre: 'pago',
      ruta: `/historias/${propia.slug}/`,
      objeto: propia.slug,
      valorUsdCentavos: pagada.precio_usd_centavos,
    });
    return Response.json({ estado: 'pagada', token: tokenDeAcceso(propia.slug).token }, { headers: sinGuardar });
  } catch (error) {
    return respuestaError(error);
  }
}

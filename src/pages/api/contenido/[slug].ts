// The locked part of a story. Served to a valid token that covers this story (the reader's own
// unlock), or to a browser whose cookie shows it paid. A Cacao Travel booking pass does not open the text
// until its payment is verified, so only `pago` tokens count here.
// The text is read from public.media_cerrado with the service role (see lib/servidor/cerrado.ts).
import type { APIContext } from 'astro';
import { verificar } from '../../../lib/firma';
import { hayBase } from '../../../lib/servidor/bd';
import { cerradoDe } from '../../../lib/servidor/cerrado';
import { respuestaError, tieneAcceso } from '../../../lib/servidor/cobros';
import { cookieLector } from '../../../lib/servidor/lector';

export const prerender = false;

const PRIVADO = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };

export async function GET(context: APIContext) {
  if (!hayBase()) {
    return Response.json(
      { error: 'No podemos abrir la historia en este momento. Probá de nuevo más tarde.' },
      { status: 503, headers: PRIVADO },
    );
  }
  const slug = context.params.slug ?? '';
  let html: string | null;
  try {
    html = await cerradoDe(slug);
  } catch (error) {
    return respuestaError(error);
  }
  if (html === null) {
    return Response.json({ error: 'Esa historia no existe o es gratis.' }, { status: 404, headers: PRIVADO });
  }

  const token = (context.request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const pase = verificar(token);
  if (pase && pase.tipo === 'pago' && pase.slugs.includes(slug)) {
    return Response.json({ html, expira: pase.exp, tipo: pase.tipo }, { headers: PRIVADO });
  }

  // No valid token: the cookie still proves the reader paid, so access outlives the stored token.
  const lector = cookieLector(context);
  if (lector) {
    try {
      if (await tieneAcceso(lector, slug)) {
        return Response.json({ html, tipo: 'acceso' }, { headers: PRIVADO });
      }
    } catch (error) {
      return respuestaError(error);
    }
  }
  return Response.json({ error: 'Acceso vencido o inválido.' }, { status: 401, headers: PRIVADO });
}

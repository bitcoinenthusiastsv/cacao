// The locked part of a story. Served to a valid token that covers this story (the reader's own
// unlock, or a pass that came with a Cacao Travel booking), or to a browser whose cookie shows it paid.
import type { APIContext } from 'astro';
import cerrado from '../../../data/cerrado.json';
import { verificar } from '../../../lib/firma';
import { hayBase } from '../../../lib/servidor/bd';
import { respuestaError, tieneAcceso } from '../../../lib/servidor/cobros';
import { cookieLector } from '../../../lib/servidor/lector';

export const prerender = false;

const textos: Record<string, string> = cerrado;
const PRIVADO = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };

export async function GET(context: APIContext) {
  const slug = context.params.slug ?? '';
  if (!Object.hasOwn(textos, slug)) {
    return Response.json({ error: 'Esa historia no existe o es gratis.' }, { status: 404, headers: PRIVADO });
  }
  const token = (context.request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const pase = verificar(token);
  if (pase && pase.slugs.includes(slug)) {
    return Response.json({ html: textos[slug], expira: pase.exp, tipo: pase.tipo }, { headers: PRIVADO });
  }

  // No valid token: the cookie still proves the reader paid, so access outlives the stored token.
  const lector = cookieLector(context);
  if (lector && hayBase()) {
    try {
      if (await tieneAcceso(lector, slug)) {
        return Response.json({ html: textos[slug], tipo: 'acceso' }, { headers: PRIVADO });
      }
    } catch (error) {
      return respuestaError(error);
    }
  }
  return Response.json({ error: 'Acceso vencido o inválido.' }, { status: 401, headers: PRIVADO });
}

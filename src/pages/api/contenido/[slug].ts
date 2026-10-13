// The locked part of a story. Served only to a valid token that covers this story: either the
// reader's own unlock, or a pass that came with a Cacao Travel booking.
import type { APIContext } from 'astro';
import cerrado from '../../../data/cerrado.json';
import { verificar } from '../../../lib/firma';

export const prerender = false;

const textos: Record<string, string> = cerrado;
const PRIVADO = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

export function GET({ params, request }: APIContext) {
  const slug = params.slug ?? '';
  if (!Object.hasOwn(textos, slug)) {
    return Response.json({ error: 'Esa historia no existe o es gratis.' }, { status: 404, headers: PRIVADO });
  }
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const pase = verificar(token);
  if (!pase || !pase.slugs.includes(slug)) {
    return Response.json({ error: 'Acceso vencido o inválido.' }, { status: 401, headers: PRIVADO });
  }
  return Response.json({ html: textos[slug], expira: pase.exp, tipo: pase.tipo }, { headers: PRIVADO });
}

// Issues the token that opens one paid story for 7 days.
//
// DEMO: no payment is checked yet. This is the single place where a Lightning invoice has to be
// verified as paid before the token is signed; everything downstream already trusts only the token.
import type { APIContext } from 'astro';
import cerrado from '../../data/cerrado.json';
import { DIA, firmar } from '../../lib/firma';

export const prerender = false;

const DIAS_DE_ACCESO = 7;

export async function POST({ request }: APIContext) {
  let slug: unknown;
  try {
    ({ slug } = await request.json());
  } catch {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  if (typeof slug !== 'string' || !Object.hasOwn(cerrado, slug)) {
    return Response.json({ error: 'Esa historia no existe o es gratis.' }, { status: 404 });
  }
  const exp = Date.now() + DIAS_DE_ACCESO * DIA;
  return Response.json(
    { token: firmar({ tipo: 'pago', slugs: [slug], exp }), expira: exp, demo: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

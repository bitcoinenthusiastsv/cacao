// Tells the booking box whether a visitor's Cacao Media token earns the reader discount on a tour.
import type { APIContext } from 'astro';
import { esLector } from '../../lib/lector';
import { DESCUENTO_LECTOR } from '../../lib/reparto';
import { todosLosTours } from '../../lib/tours';

export const prerender = false;

export async function POST({ request }: APIContext) {
  let cuerpo: { token?: unknown; tour?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  // JSON can also be null, a number or an array: only an object carries the token and the tour.
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  const tour = (await todosLosTours()).find((t) => t.id === cuerpo.tour);
  if (!tour) return Response.json({ error: 'Esa experiencia no existe.' }, { status: 404 });
  const valido = esLector(cuerpo.token, tour.data.historias);
  return Response.json(
    { valido, porcentaje: valido ? Math.round(DESCUENTO_LECTOR * 100) : 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

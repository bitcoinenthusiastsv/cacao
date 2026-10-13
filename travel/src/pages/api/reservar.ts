// Confirms a booking. The server recomputes everything from the catalogue: the client only says
// which tour, which date, how many people, and optionally shows a reader token.
//
// DEMO: no payment is taken and seats are not counted. This is where a paid Lightning invoice has to
// be verified before the confirmation is signed, and where the split below would be paid out.
import { createHash } from 'node:crypto';
import type { APIContext } from 'astro';
import { DIA, firmar } from '../../lib/firma';
import { cotizar, diaDe, hoyEnElSalvador, NOMBRE_DIA, repartir } from '../../lib/reparto';
import { MEDIA_URL, personas as limites, todosLosTours } from '../../lib/tours';
import { esLector } from '../../lib/lector';

export const prerender = false;

/** Reading that comes with a booking stays open this long. */
const DIAS_DE_LECTURA = 30;

const error = (mensaje: string, status = 400) => Response.json({ error: mensaje }, { status });

export async function POST({ request }: APIContext) {
  let c: { tour?: unknown; fecha?: unknown; personas?: unknown; lector?: unknown };
  try {
    c = await request.json();
  } catch {
    return error('Pedido inválido.');
  }
  // JSON can also be null, a number or an array: only an object carries the booking fields.
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return error('Pedido inválido.');

  const tour = (await todosLosTours()).find((t) => t.id === c.tour);
  if (!tour) return error('Esa experiencia no existe.', 404);
  const d = tour.data;

  const fecha = typeof c.fecha === 'string' ? c.fecha : '';
  const dia = diaDe(fecha);
  const hoy = hoyEnElSalvador();
  if (!dia) return error('Elegí una fecha.');
  if (fecha <= hoy) return error('La fecha tiene que ser a partir de mañana.');
  if (!d.salidas.includes(dia)) {
    return error(`Esta experiencia no sale los ${NOMBRE_DIA[dia]}. Sale: ${d.salidas.map((s) => NOMBRE_DIA[s]).join(', ')}.`);
  }

  const { min, max } = limites(d.grupo);
  const n = Number(c.personas);
  if (!Number.isInteger(n) || n < min || n > max) return error(`El grupo es de ${min} a ${max} personas.`);

  const lector = esLector(c.lector, d.historias);
  const cotizacion = cotizar(d.precio, n, lector);
  const ahora = Date.now();
  const codigo = createHash('sha256').update(`${tour.id}|${fecha}|${n}|${ahora}|${Math.random()}`).digest('hex').slice(0, 8).toUpperCase();

  return Response.json(
    {
      codigo,
      demo: true,
      creada: ahora,
      tour: { id: tour.id, titulo: d.titulo, lugar: d.lugar, duracion: d.duracion },
      fecha,
      personas: n,
      ...cotizacion,
      lector,
      reparto: repartir(cotizacion.total, d.historias.length > 0),
      // The booking opens the stories about the place on Cacao Media.
      lecturas: d.historias.map((slug) => ({ slug, url: `${MEDIA_URL}/historias/${slug}/` })),
      pase: d.historias.length
        ? firmar({ tipo: 'reserva', slugs: d.historias, exp: ahora + DIAS_DE_LECTURA * DIA, codigo })
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

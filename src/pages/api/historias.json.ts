// Public index of stories. Cacao Travel calls this to show the reading behind each experience.
import type { APIContext } from 'astro';
import { todasLasHistorias, urlHistoria } from '../../lib/historias';
import { seccionPorId } from '../../lib/secciones';

export async function GET({ site }: APIContext) {
  const absoluta = (ruta: string) => new URL(ruta, site).href;
  const historias = (await todasLasHistorias()).map((h) => ({
    id: h.id,
    titulo: h.data.titulo,
    bajada: h.data.bajada,
    seccion: seccionPorId(h.data.seccion).singular,
    lugar: h.data.lugar,
    fecha: h.data.fecha.toISOString().slice(0, 10),
    minutos: h.data.minutos,
    gratis: h.data.gratis,
    precio: h.data.precio,
    url: absoluta(urlHistoria(h)),
    foto: absoluta(h.data.portada),
  }));
  return Response.json({ version: 1, moneda: 'sats', historias });
}

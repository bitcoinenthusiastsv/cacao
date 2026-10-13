import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { todasLasHistorias, urlHistoria } from '../lib/historias';

export async function GET(context: APIContext) {
  const historias = await todasLasHistorias();
  return rss({
    title: 'Cacao Media',
    description: 'Historias de El Salvador, grano a grano.',
    site: context.site!,
    items: historias.map((h) => ({
      title: h.data.titulo,
      description: h.data.bajada,
      pubDate: h.data.fecha,
      link: urlHistoria(h),
      categories: h.data.tags,
    })),
    customData: '<language>es-sv</language>',
  });
}

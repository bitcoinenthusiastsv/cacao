// The locked text of the paid stories, read from public.media_cerrado. Server only.
// scripts/subir-cerrado.mjs fills the table. A short in-memory cache keeps repeat reads off the database.
import { bd } from './bd';

const VIDA_MS = 5 * 60 * 1000;
const memoria = new Map<string, { html: string; hasta: number }>();

/** The locked HTML of one story, or null when the table has no row for it. Only found rows are cached. */
export async function cerradoDe(slug: string): Promise<string | null> {
  const ahora = Date.now();
  const previo = memoria.get(slug);
  if (previo && previo.hasta > ahora) return previo.html;

  const { data, error } = await bd().from('media_cerrado').select('html').eq('slug', slug).maybeSingle();
  if (error) throw error;
  const html = (data as { html: string } | null)?.html ?? null;
  if (html === null) return null;
  memoria.set(slug, { html, hasta: ahora + VIDA_MS });
  return html;
}

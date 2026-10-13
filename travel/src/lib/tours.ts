import { getCollection, type CollectionEntry } from 'astro:content';

export type Tour = CollectionEntry<'tours'>;

/** Sister publication. Its stories are fetched from its public API. */
export const MEDIA_URL = (import.meta.env.PUBLIC_MEDIA_URL ?? 'https://cacao-media.vercel.app').replace(/\/$/, '');

/** All experiences, cheapest first. */
export async function todosLosTours(): Promise<Tour[]> {
  return (await getCollection('tours')).sort((a, b) => a.data.precio - b.data.precio);
}

export const urlTour = (t: Tour): string => `/experiencias/${t.id}/`;

/** Prices are in satoshis: 45,000 sats. */
export const sats = (n: number): string => `${n.toLocaleString('en-US')} sats`;

/** Sortable length in hours from "3 horas", "Día completo", "2 días, 1 noche". */
export function horas(duracion: string): number {
  const dias = duracion.match(/(\d+)\s*d[ií]as?/i);
  if (dias) return Number(dias[1]) * 24;
  const h = duracion.match(/(\d+)\s*horas?/i);
  if (h) return Number(h[1]);
  return 8;
}

/** Group limits from "2 a 8 personas". */
export function personas(grupo: string): { min: number; max: number } {
  const n = (grupo.match(/\d+/g) ?? []).map(Number);
  if (n.length >= 2) return { min: n[0], max: n[1] };
  if (n.length === 1) return { min: 1, max: n[0] };
  return { min: 1, max: 10 };
}

/** [lat, lng] from "13.85°N · 89.63°W". El Salvador is north and west, so longitude is negative. */
export function coordenadas(coords: string | undefined): [number, number] | null {
  const n = (coords ?? '').match(/\d+(?:\.\d+)?/g)?.map(Number);
  return n && n.length >= 2 ? [n[0], -n[1]] : null;
}

/** Lowercase, no accents: for matching search text. */
export const plano = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

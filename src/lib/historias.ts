import { getCollection, type CollectionEntry } from 'astro:content';
import type { SeccionId } from './secciones';

export type Historia = CollectionEntry<'historias'>;

/** All stories, newest first. */
export async function todasLasHistorias(): Promise<Historia[]> {
  const historias = await getCollection('historias');
  return historias.sort((a, b) => b.data.fecha.valueOf() - a.data.fecha.valueOf());
}

export async function historiasDeSeccion(seccion: SeccionId): Promise<Historia[]> {
  return (await todasLasHistorias()).filter((h) => h.data.seccion === seccion);
}

export const urlHistoria = (h: Historia): string => `/historias/${h.id}/`;

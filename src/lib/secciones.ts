export type SeccionId = 'cronica' | 'guia' | 'cultura' | 'cafe';

export interface Seccion {
  id: SeccionId;
  /** URL segment: /cronicas/ */
  ruta: string;
  /** Singular label for story kickers: CRÓNICA */
  singular: string;
  /** Plural label for nav: Crónicas */
  plural: string;
  descripcion: string;
}

export const SECCIONES: Seccion[] = [
  { id: 'cronica', ruta: 'cronicas', singular: 'Crónica', plural: 'Crónicas', descripcion: 'Historias largas, contadas desde adentro.' },
  { id: 'guia', ruta: 'guias', singular: 'Guía', plural: 'Guías', descripcion: 'Adónde ir, qué pedir y cuánto cuesta.' },
  { id: 'cultura', ruta: 'cultura', singular: 'Cultura', plural: 'Cultura', descripcion: 'Música, arte y lo que se habla en la calle.' },
  { id: 'cafe', ruta: 'cafe', singular: 'Café', plural: 'Café', descripcion: 'De la finca a la taza, sin vueltas.' },
];

export const seccionPorId = (id: SeccionId): Seccion => SECCIONES.find((s) => s.id === id)!;

export const slugTag = (tag: string): string =>
  tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

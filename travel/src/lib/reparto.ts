// Money rules of the marketplace, in satoshis. Used by the pages and by the booking API, so the
// number a visitor sees is the number the server confirms.

/** Readers who paid for a story about the place get this off the experience. */
export const DESCUENTO_LECTOR = 0.1;

/** How every booking is divided. The author's share only exists when a story sent the traveller. */
export const PARTES = { operador: 0.85, plataforma: 0.1, autor: 0.05 } as const;

export interface Cotizacion {
  subtotal: number;
  descuento: number;
  total: number;
}

export interface Reparto {
  operador: number;
  plataforma: number;
  autor: number;
}

export function cotizar(precio: number, personas: number, lector: boolean): Cotizacion {
  const subtotal = precio * personas;
  const descuento = lector ? Math.round(subtotal * DESCUENTO_LECTOR) : 0;
  return { subtotal, descuento, total: subtotal - descuento };
}

/** Whole satoshis that always add up to the total: the operator absorbs the rounding. */
export function repartir(total: number, conAutor: boolean): Reparto {
  const plataforma = Math.floor(total * PARTES.plataforma);
  const autor = conAutor ? Math.floor(total * PARTES.autor) : 0;
  return { operador: total - plataforma - autor, plataforma, autor };
}

export const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const;
export type Dia = (typeof DIAS)[number];
export const NOMBRE_DIA: Record<Dia, string> = {
  lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado', dom: 'domingo',
};

/** Weekday of a YYYY-MM-DD date, independent of the server's time zone. */
export function diaDe(fecha: string): Dia | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const d = new Date(`${fecha}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha ? null : DIAS[d.getUTCDay()];
}

/** Today in El Salvador (UTC-6, no daylight saving) as YYYY-MM-DD. The server and the date picker must agree on "today". */
export function hoyEnElSalvador(ahora: number = Date.now()): string {
  return new Date(ahora - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Tomorrow in El Salvador as YYYY-MM-DD: the earliest day a booking can take. */
export function mananaEnElSalvador(ahora: number = Date.now()): string {
  return hoyEnElSalvador(ahora + 24 * 60 * 60 * 1000);
}

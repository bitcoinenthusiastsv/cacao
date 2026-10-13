// Shared by the server functions and the client forms: types, Spanish labels, limits and pure checks.
// No I/O and no 'server-only', because Client Components import this file.

import { PRECIO_MAXIMO_CENTAVOS, precioACentavos } from '@/app/mi-negocio/productos/_comun/precio';

import { formatoUsd } from './dinero';

export type TipoPrecio = 'fijo' | 'cotizar';
export type EstadoNecesidad = 'abierta' | 'asignada' | 'cancelada' | 'vencida';
export type EstadoCotizacion = 'solicitada' | 'ofrecida' | 'aceptada' | 'rechazada' | 'retirada' | 'vencida';

export const ETIQUETA_NECESIDAD: Record<EstadoNecesidad, string> = {
  abierta: 'Abierta',
  asignada: 'Asignada',
  cancelada: 'Cancelada',
  vencida: 'Vencida',
};

export const ETIQUETA_COTIZACION: Record<EstadoCotizacion, string> = {
  solicitada: 'Esperando respuesta',
  ofrecida: 'Ofrecida',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  retirada: 'Retirada',
  vencida: 'Vencida',
};

export type Limite = { minimo: number; maximo: number };

// Same bounds as the database checks. Prices and budgets are whole USD cents.
export const LIMITES = {
  tituloServicio: { minimo: 2, maximo: 80 },
  descripcionServicio: { minimo: 0, maximo: 600 },
  zona: { minimo: 0, maximo: 160 },
  unidad: { minimo: 1, maximo: 40 },
  fotosServicio: { minimo: 0, maximo: 1 },
  tituloNecesidad: { minimo: 4, maximo: 100 },
  descripcionNecesidad: { minimo: 0, maximo: 1000 },
  // The text a client writes when asking a shop for a price.
  descripcionTrabajo: { minimo: 10, maximo: 1000 },
  // Messages with an offer or an answer.
  mensaje: { minimo: 0, maximo: 600 },
  // The note a client sends with a fixed-price hire.
  nota: { minimo: 0, maximo: 600 },
  clave: { minimo: 1, maximo: 100 },
  precioCentavos: { minimo: 1, maximo: PRECIO_MAXIMO_CENTAVOS },
  // The budget uses the same ceiling as prices: a person types it the same way.
  presupuestoCentavos: { minimo: 1, maximo: PRECIO_MAXIMO_CENTAVOS },
  // Categories are smallint in the database.
  categoria: { minimo: 1, maximo: 32767 },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids come from the URL or the session. A value that is not a UUID cannot be a row.
export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

/** True when the text, trimmed, has a length in characters within the limit. */
export function textoEnLimite(texto: unknown, { minimo, maximo }: Limite): texto is string {
  if (typeof texto !== 'string') return false;
  const largo = Array.from(texto.trim()).length;
  return largo >= minimo && largo <= maximo;
}

/** A whole number within the limit. Text and fractions are refused. */
export function enteroEnLimite(valor: unknown, { minimo, maximo }: Limite): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo;
}

export function esTipoPrecio(valor: unknown): valor is TipoPrecio {
  return valor === 'fijo' || valor === 'cotizar';
}

/** A USD price as typed ("3.50") in cents, or null when it is not a valid price. */
export function precioDesdeTexto(texto: string): number | null {
  const leido = precioACentavos(texto);
  return leido.ok ? leido.centavos : null;
}

/** "$5.00 por corte" for a fixed price, "Precio según el trabajo" for a quoted service. */
export function textoPrecio(servicio: {
  tipoPrecio: TipoPrecio;
  precioUsdCentavos: number | null;
  unidad: string | null;
}): string {
  if (servicio.tipoPrecio === 'cotizar' || servicio.precioUsdCentavos === null) {
    return 'Precio según el trabajo';
  }
  const precio = formatoUsd(servicio.precioUsdCentavos);
  return servicio.unidad ? `${precio} ${servicio.unidad}` : precio;
}

/**
 * Text for a LIKE search typed by a person. The search is case-insensitive and "contains",
 * so the caller adds the wildcards. Characters that break the PostgREST filter syntax become
 * spaces, and % and _ are escaped so they match only themselves.
 */
export function textoBusqueda(texto: string | undefined): string {
  const limpio = (texto ?? '')
    .replace(/[,()"*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Cut before escaping, so a backslash is never left at the end of the pattern.
    .slice(0, 80);
  return limpio.replace(/[%_]/g, (caracter) => `\\${caracter}`);
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Whole days left until `venceEn`, rounded up. Zero once it has passed. */
export function diasRestantes(venceEn: string, ahora: Date = new Date()): number {
  const restante = new Date(venceEn).getTime() - ahora.getTime();
  return Math.max(0, Math.ceil(restante / DIA_MS));
}

/** The first word of a name. Empty when there is no name. */
export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? '').trim().split(/\s+/)[0] ?? '';
}

/** A need is open for offers when it is open, not hidden by an administrator, and not past its deadline. */
export function necesidadAbierta(
  necesidad: { estado: EstadoNecesidad; oculta: boolean; venceEn: string },
  ahora: Date = new Date(),
): boolean {
  return (
    necesidad.estado === 'abierta' &&
    !necesidad.oculta &&
    new Date(necesidad.venceEn).getTime() > ahora.getTime()
  );
}

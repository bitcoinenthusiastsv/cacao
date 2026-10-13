import 'server-only';

import { cookies } from 'next/headers';

import { clienteServicio } from './supabase';

// Funnel events of CacaoMarket. The names are the ones the database allows for the 'market' site.
export type NombreEvento =
  | 'vista_producto'
  | 'agrego_carrito'
  | 'inicio_pedido'
  | 'vio_pago'
  | 'pago'
  | 'vista_servicio'
  | 'acordo_trabajo'
  | 'trabajo_hecho'
  | 'vio_pago_trabajo'
  | 'pago_trabajo';

export type EventoARegistrar = {
  nombre: NombreEvento;
  sesion: string;
  usuarioId: string | null;
  ruta: string;
  objeto: string | null;
  valorUsdCentavos: number | null;
};

// The only events a browser may send. The rest are written by the server, where the order is known.
export const EVENTOS_DEL_NAVEGADOR: readonly NombreEvento[] = ['vista_producto', 'agrego_carrito', 'vista_servicio'];

// An anonymous id for one browser. HttpOnly, so scripts on the page cannot read it.
export const COOKIE_SESION = 'cm_sesion';
const UN_ANO_SEG = 60 * 60 * 24 * 365;
const FORMATO_SESION = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Records one funnel event. Analytics must never break a purchase: every failure is logged and the
 * caller carries on. The database keeps one row per event, session and object per hour.
 */
export async function registrarEvento(evento: EventoARegistrar): Promise<void> {
  try {
    const { error } = await clienteServicio().rpc('registrar_evento', {
      p_sitio: 'market',
      p_nombre: evento.nombre,
      p_sesion: evento.sesion,
      p_usuario: evento.usuarioId ?? (null as unknown as string),
      p_ruta: evento.ruta,
      p_objeto: evento.objeto ?? (null as unknown as string),
      p_valor: evento.valorUsdCentavos ?? (null as unknown as number),
    });
    if (error) console.warn('registrar_evento:', error.message);
  } catch (error) {
    console.warn('registrar_evento:', error instanceof Error ? error.message : error);
  }
}

/** The visit's session id if the browser already has one. Safe in Server Components (read only). */
export async function sesionDeVisita(): Promise<string | null> {
  try {
    const valor = (await cookies()).get(COOKIE_SESION)?.value;
    return valor && FORMATO_SESION.test(valor) ? valor : null;
  } catch {
    return null;
  }
}

/**
 * The visit's session id, created when the browser has none. Only from a Server Function or a Route
 * Handler: rendering a page cannot set cookies. A cookie that cannot be written still gives an id.
 */
export async function sesionDeVisitaCreando(): Promise<string> {
  const existente = await sesionDeVisita();
  if (existente) return existente;
  const nueva = crypto.randomUUID();
  try {
    (await cookies()).set(COOKIE_SESION, nueva, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: UN_ANO_SEG,
      secure: process.env.NODE_ENV === 'production',
    });
  } catch {
    // Not a place that can set cookies: the event still uses this id for the one request.
  }
  return nueva;
}

/**
 * The session a payment is counted under. A payment confirmed by the seller has no buyer browser,
 * so it counts as its own session, one per order.
 */
export function sesionDePago(sesion: string | null, ordenId: string): string {
  return sesion ?? `orden-${ordenId}`;
}

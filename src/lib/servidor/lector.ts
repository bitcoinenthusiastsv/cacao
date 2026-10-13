// The anonymous reader: one id per browser, kept in an HttpOnly cookie. Server only.
// The id is never sent to page scripts; the browser only sends the cookie back.
import type { APIContext } from 'astro';
import { bd } from './bd';

export const COOKIE_LECTOR = 'cm_lector';
const UN_ANO = 60 * 60 * 24 * 365;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The reader id the browser sent, or null. Does not touch the database. */
export function cookieLector(context: APIContext): string | null {
  const valor = context.cookies.get(COOKIE_LECTOR)?.value ?? '';
  return UUID.test(valor) ? valor : null;
}

/** The reader id, creating the reader on first contact. Sets the cookie when it is new or was replaced. */
export async function lectorDe(context: APIContext): Promise<string> {
  const previo = cookieLector(context);
  const { data, error } = await bd().rpc('media_lector', { p_lector: previo });
  if (error) throw error;
  const fila = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  if (!fila?.id) throw new Error('media_lector no devolvió un lector.');
  if (fila.id !== previo) {
    context.cookies.set(COOKIE_LECTOR, fila.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: UN_ANO,
      // Plain http only in local development; a deployed site is always https.
      secure: context.url.protocol === 'https:',
    });
  }
  return fila.id;
}

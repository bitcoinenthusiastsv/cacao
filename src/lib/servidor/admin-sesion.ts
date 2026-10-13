// Admin sign-in for the Cacao Media panel. Server only.
//
// The cookie `cm_admin` is `<base64url JSON {exp}>.<base64url HMAC-SHA256>`. The HMAC covers a fixed
// prefix so an admin token cannot be replayed as a paid-story token, which is signed with the same
// secret. The cookie is HttpOnly and SameSite=Strict, so page scripts cannot read it.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

export const COOKIE_ADMIN = 'cm_admin';
const DURACION_S = 12 * 60 * 60;
const PREFIJO = 'admin:';

type OpcionesCookie = Parameters<AstroCookies['set']>[2];

// Astro exposes .env values through import.meta.env; a deployed function has them in process.env.
function variable(nombre: string): string | undefined {
  const deAstro = (import.meta.env as Record<string, string | undefined> | undefined)?.[nombre];
  return deAstro ?? process.env[nombre];
}

// Same rule as src/lib/firma.ts, so both kinds of token are signed the same way.
function secreto(): string {
  const s = process.env.CACAO_SECRET;
  if (s && s.length >= 32) return s;
  if (!process.env.VERCEL) return 'solo-para-desarrollo-local-no-usar-en-produccion';
  throw new Error('CACAO_SECRET is not set');
}

const firma = (datos: string): Buffer =>
  createHmac('sha256', secreto()).update(PREFIJO + datos).digest();

export function firmarSesion(ahora: number = Date.now()): string {
  const datos = Buffer.from(JSON.stringify({ exp: ahora + DURACION_S * 1000 })).toString('base64url');
  return `${datos}.${firma(datos).toString('base64url')}`;
}

/** True when the token has a good signature and has not expired. Anything odd is false. */
export function sesionValida(token: unknown, ahora: number = Date.now()): boolean {
  if (typeof token !== 'string' || token.length > 300) return false;
  const partes = token.split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return false;
  const [datos, recibida] = partes;
  try {
    const firmaRecibida = Buffer.from(recibida, 'base64url');
    const esperada = firma(datos);
    if (firmaRecibida.length !== esperada.length || !timingSafeEqual(firmaRecibida, esperada)) return false;
    const { exp } = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')) as { exp?: unknown };
    // A token can never live longer than one session, even if a secret leaks with a wrong expiry.
    return typeof exp === 'number' && exp > ahora && exp <= ahora + DURACION_S * 1000;
  } catch {
    return false;
  }
}

export function sesionDeCookies(cookies: AstroCookies): boolean {
  return sesionValida(cookies.get(COOKIE_ADMIN)?.value);
}

/** The configured admin key, or undefined. Without it the key form is disabled. */
export function claveAdminConfigurada(): string | undefined {
  const clave = variable('ADMIN_CLAVE');
  return clave && clave.length > 0 ? clave : undefined;
}

/** Compares digests so the time taken does not depend on how much of the key matched. */
export function claveCoincide(intento: string, esperada: string): boolean {
  if (intento.length === 0) return false;
  const a = createHash('sha256').update(intento).digest();
  const b = createHash('sha256').update(esperada).digest();
  return timingSafeEqual(a, b);
}

/** The demo button shows only when the site runs in demo mode. */
export const demoActiva = (): boolean => variable('PUBLIC_DEMO') === '1';

export function opcionesCookie(url: URL): OpcionesCookie {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    // Browsers refuse Secure cookies over plain http, so local development keeps it off.
    secure: url.protocol === 'https:',
    maxAge: DURACION_S,
  };
}

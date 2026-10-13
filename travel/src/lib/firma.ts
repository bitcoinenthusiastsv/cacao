// Signed tokens shared by Cacao Media and Cacao Travel. Server only.
// A token is `<base64url JSON payload>.<base64url HMAC-SHA256>`. The payload is readable by anyone;
// only someone with CACAO_SECRET can produce a valid signature.
// Keep this file identical in both projects (src/lib/firma.ts and travel/src/lib/firma.ts).
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface Pase {
  /** What the token is: a paid story unlock, or a booking that comes with reading. */
  tipo: 'pago' | 'reserva';
  /** Stories this token opens. */
  slugs: string[];
  /** Expiry, epoch milliseconds. */
  exp: number;
  /** Booking code, on `reserva` tokens. */
  codigo?: string;
}

function secreto(): string {
  const s = process.env.CACAO_SECRET;
  if (s && s.length >= 32) return s;
  // Local development only. A deployed build without the variable must not sign anything.
  if (!process.env.VERCEL) return 'solo-para-desarrollo-local-no-usar-en-produccion';
  throw new Error('CACAO_SECRET is not set');
}

const mac = (datos: string): Buffer => createHmac('sha256', secreto()).update(datos).digest();

export function firmar(pase: Pase): string {
  const datos = Buffer.from(JSON.stringify(pase)).toString('base64url');
  return `${datos}.${mac(datos).toString('base64url')}`;
}

/** The payload if the signature is good and the token has not expired; otherwise null. */
export function verificar(token: unknown, ahora: number = Date.now()): Pase | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [datos, firma, sobra] = token.split('.');
  if (!datos || !firma || sobra !== undefined) return null;
  try {
    const recibida = Buffer.from(firma, 'base64url');
    const esperada = mac(datos);
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
    const pase = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')) as Pase;
    if (!Array.isArray(pase.slugs) || typeof pase.exp !== 'number' || pase.exp <= ahora) return null;
    return pase;
  } catch {
    return null;
  }
}

export const DIA = 24 * 60 * 60 * 1000;

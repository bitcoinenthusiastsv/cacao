// Whether a Cacao Media token earns the reader discount on a tour: validly signed, unexpired, issued
// for a paid story, and that story is one this tour is linked to. Server only.
import { verificar } from './firma';

export function esLector(token: unknown, historias: string[]): boolean {
  const pase = verificar(token);
  return Boolean(pase && pase.tipo === 'pago' && pase.slugs.some((s) => historias.includes(s)));
}

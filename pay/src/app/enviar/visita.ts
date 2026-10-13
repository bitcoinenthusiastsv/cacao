// Visit id for the funnel. The browser keeps a random id in a cookie for half an hour. It is set
// here, on the client, because a cookie written by a server action would re-render the page.

export const NOMBRE_COOKIE_VISITA = 'cacaopay_visita';
const DURACION_SEGUNDOS = 30 * 60;

/** A random id: a UUID where the browser has one, and a hex string on plain http addresses. */
export function idAleatorio(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sets the visit cookie when the visit has none. Client only. */
export function asegurarVisita(): void {
  const yaExiste = document.cookie.split(';').some((c) => c.trim().startsWith(`${NOMBRE_COOKIE_VISITA}=`));
  if (yaExiste) return;
  document.cookie = `${NOMBRE_COOKIE_VISITA}=${idAleatorio()}; path=/; max-age=${DURACION_SEGUNDOS}; samesite=lax`;
}

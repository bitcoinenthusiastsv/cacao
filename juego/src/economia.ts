/** Sats simulados: sin valor real ni retiro. */

export const SATS_POR_ACIERTO = 40;
export const BONUS_RACHA_POR_NIVEL = 15;
export const TOPE_PARTIDA = 500;

export function idLogro(sesionId: string, indicePregunta: number): string {
  return `${sesionId}:q${indicePregunta}`;
}

export function calcularPremio(rachaTrasAcierto: number): number {
  if (rachaTrasAcierto < 1) return 0;
  const base = SATS_POR_ACIERTO;
  const bonus = rachaTrasAcierto >= 2 ? (rachaTrasAcierto - 1) * BONUS_RACHA_POR_NIVEL : 0;
  return base + bonus;
}

export function aplicarTopePartida(yaOtorgadoEnPartida: number, premio: number): number {
  const restante = TOPE_PARTIDA - yaOtorgadoEnPartida;
  if (restante <= 0) return 0;
  return Math.min(premio, restante);
}

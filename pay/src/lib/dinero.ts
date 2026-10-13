// Money helpers. Prices are stored in USD cents; amounts in sats are whole numbers.

function positivoFinito(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

// Round up so the seller never receives less than the USD price.
export function usdCentavosASats(centavos: number, cotizacionUsdBtc: number): number {
  if (!positivoFinito(centavos) || !Number.isInteger(centavos)) {
    throw new RangeError('Los centavos deben ser un entero mayor que cero.');
  }
  if (!positivoFinito(cotizacionUsdBtc)) {
    throw new RangeError('La cotización debe ser un número mayor que cero.');
  }
  return Math.ceil((centavos * 1_000_000) / cotizacionUsdBtc);
}

// Thousands separator for whole numbers, e.g. 1250 -> "1,250".
function agrupar(entero: number): string {
  return String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatoSats(sats: number): string {
  return `${agrupar(sats)} ${sats === 1 ? 'sat' : 'sats'}`;
}

export function formatoUsd(centavos: number): string {
  // Work on the absolute value so the minus sign goes before the dollar sign.
  const signo = centavos < 0 ? '-' : '';
  const absolutos = Math.abs(centavos);
  const dolares = Math.floor(absolutos / 100);
  const centavosRestantes = absolutos % 100;
  return `${signo}$${agrupar(dolares)}.${String(centavosRestantes).padStart(2, '0')}`;
}

// Theoretical platform fee in sats, rounded up. bps = basis points (100 = 1%).
export function comisionTeorica(sats: number, bps: number): number {
  return Math.ceil((sats * bps) / 10_000);
}

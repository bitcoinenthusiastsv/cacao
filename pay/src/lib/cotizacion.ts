import { formatoSats, formatoUsd } from './dinero';

// Quote arithmetic for a transfer. Pure: the BTC price comes in as an argument, so the same code
// runs in the browser for the preview and on the server when a transfer is created.
// The database repeats these rules (pay_crear_transferencia), so keep both in step:
//   fee       = fixed + ceil(amount * bps / 10000)      (rounded up: the fee never comes out short)
//   net       = amount - fee
//   USD cents = floor(net * rate)                        (rounded down: the recipient never gets more)
//   sats      = floor(net / 100 * sats per unit)

export type Moneda = 'USD' | 'EUR' | 'SATS';
export type Entrega = 'lightning' | 'efectivo' | 'cuenta';
export type Tarifa = { fijoCentavos: number; porcentajeBps: number; minutosEstimados: number };
export type Cotizacion = {
  monedaOrigen: 'USD' | 'EUR';
  montoOrigenCentavos: number;
  comisionCentavos: number;
  netoCentavos: number;
  tasa: number;
  tasaFuente: string;
  monedaDestino: 'USD' | 'SATS';
  montoDestino: number;
  entrega: Entrega;
  minutosEstimados: number;
};

// Fee table, as seeded in pay_tarifas. Constants until the server reads the table.
export const TARIFAS: Record<Entrega, Tarifa> = {
  lightning: { fijoCentavos: 0, porcentajeBps: 50, minutosEstimados: 1 },
  cuenta: { fijoCentavos: 99, porcentajeBps: 100, minutosEstimados: 60 },
  efectivo: { fijoCentavos: 199, porcentajeBps: 150, minutosEstimados: 30 },
};

// USD per one EUR. A fixed demo rate, the same value as the seed of pay_tasas.
export const TASA_EUR_USD = 1.08;
export const FUENTE_EUR_USD = 'Tasa fija de demostración';

// Limits in cents of the origin currency: $1.00 to $3,000.00.
export const MINIMO_CENTAVOS = 100;
export const MAXIMO_CENTAVOS = 300_000;

// Rates are kept with eight decimals, like numeric(18,8) in the database, so the floor is exact.
const ESCALA_TASA = BigInt(100_000_000);

/** Text for an amount in its currency: "$3.50", "€3.50" or "1,250 sats". */
export function formatoMonto(valor: number, moneda: Moneda): string {
  if (moneda === 'SATS') return formatoSats(valor);
  const texto = formatoUsd(valor);
  return moneda === 'EUR' ? `€${texto.slice(1)}` : texto;
}

/**
 * Quotes a transfer. Returns the four lines the person sees (amount, fee, rate, received), or the
 * sentence to show when the amount cannot be quoted.
 * `usdBtc` is null when the BTC price is not available: cash and bank quotes still work.
 */
export function cotizar(entrada: {
  monedaOrigen: 'USD' | 'EUR';
  montoOrigenCentavos: number;
  entrega: Entrega;
  tarifas: Record<Entrega, Tarifa>;
  eurUsd: number;
  usdBtc: number | null;
  fuenteBtc: string;
}): Cotizacion | { error: string } {
  const { monedaOrigen, montoOrigenCentavos, entrega, tarifas, eurUsd, usdBtc, fuenteBtc } = entrada;

  if (
    !Number.isInteger(montoOrigenCentavos) ||
    montoOrigenCentavos < MINIMO_CENTAVOS ||
    montoOrigenCentavos > MAXIMO_CENTAVOS
  ) {
    const desde = formatoMonto(MINIMO_CENTAVOS, monedaOrigen);
    const hasta = formatoMonto(MAXIMO_CENTAVOS, monedaOrigen);
    return { error: `El monto tiene que estar entre ${desde} y ${hasta}.` };
  }

  // Lightning pays in sats, cash and bank accounts in USD. The database enforces the same pairs.
  const monedaDestino = entrega === 'lightning' ? 'SATS' : 'USD';
  const hayPrecioBtc = usdBtc !== null && Number.isFinite(usdBtc) && usdBtc > 0;
  if (monedaDestino === 'SATS' && !hayPrecioBtc) {
    return { error: 'No tenemos el precio de bitcoin ahora, así que el envío por Lightning no está disponible.' };
  }
  if (!Number.isFinite(eurUsd) || eurUsd <= 0) {
    return { error: 'No tenemos una tasa de cambio válida. Probá más tarde.' };
  }

  const tarifa = tarifas[entrega];
  // Rounded up: integer arithmetic, so no float error at the boundary.
  const comision = tarifa.fijoCentavos + Math.floor((montoOrigenCentavos * tarifa.porcentajeBps + 9_999) / 10_000);
  const neto = montoOrigenCentavos - comision;
  if (neto <= 0) {
    return { error: 'La comisión iguala o supera el monto. Probá con un monto más alto.' };
  }

  // Sats per one whole origin unit for Lightning; USD per origin unit otherwise.
  let tasa: number;
  let tasaFuente: string;
  if (monedaDestino === 'SATS') {
    const satsPorUsd = 100_000_000 / (usdBtc as number);
    tasa = monedaOrigen === 'USD' ? satsPorUsd : eurUsd * satsPorUsd;
    tasaFuente = monedaOrigen === 'USD' ? fuenteBtc : `${FUENTE_EUR_USD}; ${fuenteBtc}`;
  } else if (monedaOrigen === 'EUR') {
    tasa = eurUsd;
    tasaFuente = FUENTE_EUR_USD;
  } else {
    tasa = 1;
    tasaFuente = 'Misma moneda: no hay conversión';
  }
  const tasa8 = BigInt(Math.round(tasa * 100_000_000));
  tasa = Number(tasa8) / 100_000_000;

  // Exact integer arithmetic on the eight-decimal rate; the division truncates, which is the floor.
  const netoExacto = BigInt(neto);
  const montoDestino =
    monedaDestino === 'USD'
      ? Number((netoExacto * tasa8) / ESCALA_TASA)
      : Number((netoExacto * tasa8) / (BigInt(100) * ESCALA_TASA));
  if (montoDestino <= 0) {
    return { error: 'El monto no alcanza para recibir al menos una unidad. Probá con un monto más alto.' };
  }

  return {
    monedaOrigen,
    montoOrigenCentavos,
    comisionCentavos: comision,
    netoCentavos: neto,
    tasa,
    tasaFuente,
    monedaDestino,
    montoDestino,
    entrega,
    minutosEstimados: tarifa.minutosEstimados,
  };
}

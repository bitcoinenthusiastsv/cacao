import { formatoMonto, MAXIMO_CENTAVOS, MINIMO_CENTAVOS, type Entrega } from '@/lib/cotizacion';

// Text and number helpers for the sender's screens. Pure, so Client and Server Components share them.

export type TarifaMostrada = {
  entrega: Entrega;
  fijoCentavos: number;
  porcentajeBps: number;
  minutosEstimados: number;
  descripcion: string;
};

const ZONA_EL_SALVADOR = 'America/El_Salvador';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

// Same rule as the quote preview: "100", "100.5" and "100,50" are amounts.
export function leerMonto(texto: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(texto.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** The sentence under the amount field, or null when the amount can be sent. */
export function errorDeMonto(texto: string, moneda: 'USD' | 'EUR'): string | null {
  if (texto.trim() === '') return 'Escribí cuánto querés enviar, por ejemplo 100.';
  const centavos = leerMonto(texto);
  if (centavos === null) return 'Escribí el monto solo con números, por ejemplo 1000 o 1000.50.';
  if (centavos < MINIMO_CENTAVOS || centavos > MAXIMO_CENTAVOS) {
    return `El monto tiene que estar entre ${formatoMonto(MINIMO_CENTAVOS, moneda)} y ${formatoMonto(MAXIMO_CENTAVOS, moneda)}.`;
  }
  return null;
}

/** "12 oct, 3:40 p. m." in El Salvador time, with the year when asked: "12 oct 2026, 3:40 p. m.". */
export function fechaEnvio(iso: string, conAnio = false): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_EL_SALVADOR,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  const hora = Number(valor('hour')) % 24;
  const hora12 = hora % 12 === 0 ? 12 : hora % 12;
  const periodo = hora < 12 ? 'a. m.' : 'p. m.';
  const anio = conAnio ? ` ${valor('year')}` : '';
  return `${Number(valor('day'))} ${MESES[Number(valor('month')) - 1]}${anio}, ${hora12}:${valor('minute')} ${periodo}`;
}

// Thousands separators and at most the given decimals, as the rest of the app shows numbers.
export function numeroCon(valor: number, decimales: number): string {
  return valor.toLocaleString('en-US', { maximumFractionDigits: decimales });
}

/** The rate in plain words, with its source. Dollars to dollars has no rate, so it says so. */
export function tipoDeCambio(datos: {
  monedaOrigen: 'USD' | 'EUR';
  monedaDestino: 'USD' | 'SATS';
  tasa: number;
  tasaFuente: string;
}): { principal: string; nota: string } {
  if (datos.monedaDestino === 'SATS') {
    return { principal: `1 ${datos.monedaOrigen} = ${numeroCon(Math.round(datos.tasa), 0)} sats`, nota: datos.tasaFuente };
  }
  if (datos.monedaOrigen === 'EUR') {
    return { principal: `1 EUR = ${numeroCon(datos.tasa, 4)} USD`, nota: datos.tasaFuente };
  }
  return { principal: 'No hay cambio: El Salvador usa dólares', nota: '' };
}

/** The fee formula in words: "$1.99 fijos más 1.5% del monto". */
export function comisionExplicada(
  tarifa: Pick<TarifaMostrada, 'fijoCentavos' | 'porcentajeBps'>,
  moneda: 'USD' | 'EUR',
): string {
  const porcentaje = `${numeroCon(tarifa.porcentajeBps / 100, 2)}% del monto`;
  if (tarifa.fijoCentavos === 0) return porcentaje;
  return `${formatoMonto(tarifa.fijoCentavos, moneda)} fijos más ${porcentaje}`;
}

/** The estimated time as a sentence. */
export function plazoEnvio(minutos: number): string {
  if (minutos === 1) return 'Llega en un minuto.';
  if (minutos === 60) return 'Llega en una hora.';
  return `Llega en unos ${minutos} minutos.`;
}

// How the recipient gets the money, after "recibe" in a sentence.
export const VIA_RECIBE: Record<Entrega, string> = {
  efectivo: 'en efectivo',
  cuenta: 'en su cuenta bancaria',
  lightning: 'en su billetera de bitcoin',
};

/** "$100.00 menos $3.49 de comisión son $96.51", with the converted amount when the currencies differ. */
export function fraseDeLaSuma(datos: {
  monedaOrigen: 'USD' | 'EUR';
  montoOrigenCentavos: number;
  comisionCentavos: number;
  netoCentavos: number;
  monedaDestino: 'USD' | 'SATS';
  montoDestino: number;
}): string {
  const frase = `${formatoMonto(datos.montoOrigenCentavos, datos.monedaOrigen)} menos ${formatoMonto(datos.comisionCentavos, datos.monedaOrigen)} de comisión son ${formatoMonto(datos.netoCentavos, datos.monedaOrigen)}.`;
  if (datos.monedaOrigen === 'USD' && datos.monedaDestino === 'USD') return frase;
  return `${frase} Al tipo de cambio, eso queda en ${formatoMonto(datos.montoDestino, datos.monedaDestino)}.`;
}

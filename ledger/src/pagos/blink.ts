import { ErrorLedger } from "../errores.ts";
import type { PagoLightning } from "./tipos.ts";

// Adapter for the Blink `receive.lightning` webhook. The payload shape follows
// https://dev.blink.sv/api/webhooks. Only the fields used here are read.
//
// The rate is not read from settlementDisplayPrice: the amounts in the same
// payload are what the rate is computed from, so they are the reliable pair.

const SATS_POR_BTC = 100_000_000;

function texto(v: unknown, campo: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new ErrorLedger(`El webhook de Blink no trae el campo ${campo}.`);
  }
  return v;
}

// "4.10" -> 410. Blink sends the display amount as a decimal string with two places.
function centavosDesdeDisplay(v: unknown): number {
  const s = texto(v, "transaction.settlementDisplayAmount");
  const m = /^(\d+)\.(\d{2})$/.exec(s);
  if (!m) throw new ErrorLedger(`El monto en USD del webhook de Blink no es válido: "${s}".`);
  return Number(m[1]) * 100 + Number(m[2]);
}

// Rate in cents of USD per BTC, rounded half up: usdCentavos * 1e8 / sats.
// Exported so that other rail adapters derive the rate the same way.
export function tasaCentavosPorBtc(usdCentavos: number, sats: number): string {
  const tc = Math.floor((2 * usdCentavos * SATS_POR_BTC + sats) / (2 * sats));
  return `${Math.floor(tc / 100)}.${String(tc % 100).padStart(2, "0")}`;
}

export function pagoDesdeBlink(payload: unknown): PagoLightning {
  if (typeof payload !== "object" || payload === null) {
    throw new ErrorLedger("El archivo de Blink no contiene un objeto JSON.");
  }
  const p = payload as Record<string, unknown>;
  if (p.eventType !== "receive.lightning") {
    throw new ErrorLedger(`El evento de Blink es "${String(p.eventType)}", se esperaba "receive.lightning".`);
  }
  const tx = p.transaction as Record<string, unknown> | undefined;
  if (typeof tx !== "object" || tx === null) {
    throw new ErrorLedger("El webhook de Blink no trae el objeto transaction.");
  }
  if (tx.status !== "success") {
    throw new ErrorLedger(`El pago de Blink no está liquidado (estado "${String(tx.status)}").`);
  }
  if (tx.settlementCurrency !== "BTC") {
    throw new ErrorLedger(`La moneda de liquidación de Blink es "${String(tx.settlementCurrency)}", se esperaba BTC.`);
  }
  const sats = tx.settlementAmount;
  if (typeof sats !== "number" || !Number.isSafeInteger(sats) || sats <= 0) {
    throw new ErrorLedger("El monto en sats del webhook de Blink debe ser un entero mayor que cero.");
  }
  const display = tx.settlementDisplayPrice as Record<string, unknown> | undefined;
  if (display && display.displayCurrency !== undefined && display.displayCurrency !== "USD") {
    throw new ErrorLedger(`La moneda de referencia de Blink es "${String(display.displayCurrency)}", se esperaba USD.`);
  }
  const via = tx.initiationVia as Record<string, unknown> | undefined;
  const hash = texto(via?.paymentHash, "transaction.initiationVia.paymentHash");
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new ErrorLedger("El payment hash del webhook de Blink no tiene 64 caracteres hexadecimales en minúscula.");
  }
  const momento = texto(tx.createdAt, "transaction.createdAt");
  if (Number.isNaN(Date.parse(momento))) {
    throw new ErrorLedger(`La fecha del webhook de Blink no es ISO-8601: "${momento}".`);
  }
  const montoCentavos = centavosDesdeDisplay(tx.settlementDisplayAmount);
  if (montoCentavos <= 0) {
    throw new ErrorLedger("El monto en USD del webhook de Blink debe ser mayor que cero.");
  }
  return {
    rail: "lightning",
    montoCentavos,
    momento: new Date(momento).toISOString(),
    sats,
    tasaUsdPorBtc: tasaCentavosPorBtc(montoCentavos, sats),
    tasaFuente: "Blink receive.lightning: settlementDisplayAmount / settlementAmount",
    paymentHash: hash,
    idTransaccion: texto(tx.id, "transaction.id"),
  };
}

import { ErrorLedger } from "../errores.ts";
import type { PagoEfectivo } from "./tipos.ts";

// A cash payment the merchant marks by hand. Nothing is verified by a rail here:
// the person at the till is the source, so the time is the moment of marking.
export function pagoEfectivo(montoCentavos: number, ahora: Date = new Date()): PagoEfectivo {
  if (!Number.isSafeInteger(montoCentavos) || montoCentavos <= 0) {
    throw new ErrorLedger("El monto en efectivo debe ser mayor que cero.");
  }
  return {
    rail: "efectivo",
    montoCentavos,
    momento: ahora.toISOString(),
  };
}

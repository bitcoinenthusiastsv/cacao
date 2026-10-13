import { ErrorLedger } from "../errores.ts";
import type { Pago, PagoLightning } from "../pagos/tipos.ts";
import { GENERACION_POR_DEFECTO, type Generacion } from "../generacion.ts";

// The payment code follows the rail that actually settled:
//   efectivo                  -> 01 Billetes y monedas (any document)
//   lightning, CCF 03          -> 11 Bitcoin (valid in both generations)
//   lightning, factura 01 caso -> 99 Otros, with the referencia describing the payment.
//     The caso schema of 01 refuses 11 and CAT-017 lists 99 as the honest code.
//   lightning, factura 01 2026 -> 11 Bitcoin. The 2026 schema allows it; the caller prints a warning.
//
// Referencia convention, at most 50 characters:
//   BTC-LN|<sats>sat|<USD por BTC>|<first 12 hex of the payment hash>
// Example: BTC-LN|12236sat|36940.18|bf6b61f814b2
// The sats amount is what was received. The rate shows what the USD figure was based on.
// The hash prefix links the document to the full attestation record. See docs/hallazgos.md.
export const LARGO_MAXIMO_REFERENCIA = 50;

export interface FormaDePago {
  codigo: string;
  referencia: string | null;
}

export function referenciaLightning(pago: PagoLightning): string {
  const ref = `BTC-LN|${pago.sats}sat|${pago.tasaUsdPorBtc}|${pago.paymentHash.slice(0, 12)}`;
  if (ref.length > LARGO_MAXIMO_REFERENCIA) {
    throw new ErrorLedger(`La referencia de pago pasa de ${LARGO_MAXIMO_REFERENCIA} caracteres: "${ref}".`);
  }
  return ref;
}

// forzarCodigo exists to show the validator refusing a code. It does not change the
// default behaviour, and the resulting document is rejected by validation when the
// generation refuses the code.
export function formaDePago(pago: Pago, tipoDte: "01" | "03", forzarCodigo?: string, generacion: Generacion = GENERACION_POR_DEFECTO): FormaDePago {
  if (pago.rail === "efectivo") {
    return { codigo: forzarCodigo ?? "01", referencia: null };
  }
  const referencia = referenciaLightning(pago);
  if (forzarCodigo !== undefined) return { codigo: forzarCodigo, referencia };
  if (tipoDte === "03") return { codigo: "11", referencia };
  return { codigo: generacion === "2026" ? "11" : "99", referencia };
}

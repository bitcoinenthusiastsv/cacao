import { createHash } from "node:crypto";
import { canonico } from "./atestacion.ts";
import { generacionDeDocumento, type Generacion } from "./generacion.ts";
import { validarDte } from "./validar.ts";

// A stand-in for the Ministry's reception service. It is not the Ministry and it never
// talks to the network. It validates the document the same way the builder does, and it
// accepts test-environment documents only (ambiente "00"), because the real test service
// is not reachable from here. Every seal it produces is marked as simulated.

export interface RespuestaRecepcion {
  aceptado: boolean;
  // SIMULADO- plus 34 upper-case hex characters. Null when the document is refused.
  sello: string | null;
  momento: string;
  observaciones: string[];
}

// Reproducible: the same document always gets the same seal.
export function selloSimulado(documento: unknown): string {
  const hex = createHash("sha256").update(canonico(documento)).digest("hex").toUpperCase().slice(0, 34);
  return `SIMULADO-${hex}`;
}

export function recibir(documento: unknown, ahora: Date, opciones: { generacion?: Generacion } = {}): RespuestaRecepcion {
  const generacion = opciones.generacion ?? generacionDeDocumento(documento) ?? undefined;
  const validacion = validarDte(documento, { permitirProduccion: false, generacion });
  const momento = ahora.toISOString();
  if (!validacion.ok) {
    const observaciones = [...validacion.esquema, ...validacion.reglas].map((f) => `${f.ruta}: ${f.mensaje}`);
    return { aceptado: false, sello: null, momento, observaciones };
  }
  return { aceptado: true, sello: selloSimulado(documento), momento, observaciones: [] };
}

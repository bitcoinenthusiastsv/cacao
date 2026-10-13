import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ErrorLedger } from "./errores.ts";

// Rate attestation: what the DTE has no field for. Each record links to the one before it
// through its hash, so a record cannot change after later ones were written without the
// chain breaking. See docs/atestacion.md.

export const HASH_INICIAL = "0".repeat(64);

// Canonical JSON: keys sorted by code unit, no whitespace, undefined dropped.
// Integers are written without a fraction; non-integers use the shortest JS form.
export function canonico(valor: unknown): string {
  if (valor === null) return "null";
  if (typeof valor === "boolean") return valor ? "true" : "false";
  if (typeof valor === "string") return JSON.stringify(valor);
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new ErrorLedger("No se puede canonizar un número no finito.");
    return JSON.stringify(valor);
  }
  if (Array.isArray(valor)) return `[${valor.map((v) => canonico(v)).join(",")}]`;
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    const claves = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
  }
  throw new ErrorLedger(`No se puede canonizar un valor de tipo ${typeof valor}.`);
}

export interface Atestacion {
  anterior: string;
  ticket: string;
  codigoGeneracion: string;
  numeroControl: string;
  tipoDte: "01" | "03";
  generacion: string;
  momentoPago: string;
  sats: number;
  usdCentavos: number;
  tasaUsdPorBtc: string;
  tasaFuente: string;
  paymentHash: string;
  codigoFormaPago: string;
  referencia: string | null;
  registrada: string;
  hash: string;
}

export type DatosAtestacion = Omit<Atestacion, "anterior" | "hash">;

export function hashDe(registro: Omit<Atestacion, "hash"> | Atestacion): string {
  const { hash: _descartado, ...sinHash } = registro as Atestacion;
  return createHash("sha256").update(canonico(sinHash)).digest("hex");
}

export function rutaAtestaciones(datos: string): string {
  return join(datos, "atestaciones.jsonl");
}

function lineasCrudas(datos: string): string[] {
  const ruta = rutaAtestaciones(datos);
  if (!existsSync(ruta)) return [];
  return readFileSync(ruta, "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
}

// Parsed records, as stored. This does not verify them; use verificarCadena for that.
export function leerAtestaciones(datos: string): Atestacion[] {
  return lineasCrudas(datos).map((l) => JSON.parse(l) as Atestacion);
}

export function atestacionesDeTicket(datos: string, idTicket: string): Atestacion[] {
  return leerAtestaciones(datos).filter((a) => a.ticket === idTicket);
}

export interface ResultadoRegistro {
  registro: Atestacion;
  nueva: boolean;
}

// Appends one record. A second call for the same ticket and codigoGeneracion writes nothing.
export function registrarAtestacion(datos: string, entrada: DatosAtestacion): ResultadoRegistro {
  const existentes = leerAtestaciones(datos);
  const previa = existentes.find((a) => a.ticket === entrada.ticket && a.codigoGeneracion === entrada.codigoGeneracion);
  if (previa) return { registro: previa, nueva: false };
  const anterior = existentes.length > 0 ? (existentes[existentes.length - 1] as Atestacion).hash : HASH_INICIAL;
  const sinHash = { ...entrada, anterior };
  const registro: Atestacion = { ...sinHash, hash: hashDe(sinHash as Atestacion) };
  mkdirSync(datos, { recursive: true });
  appendFileSync(rutaAtestaciones(datos), `${canonico(registro)}\n`, "utf8");
  return { registro, nueva: true };
}

export interface ResultadoVerificacion {
  ok: boolean;
  registros: number;
  // First broken link, 1-based line number in the file.
  primerRoto: { linea: number; motivo: string } | null;
  cabeza: string;
}

// Walks the whole chain and stops at the first broken link.
export function verificarCadena(datos: string): ResultadoVerificacion {
  const lineas = lineasCrudas(datos);
  let previo = HASH_INICIAL;
  for (let i = 0; i < lineas.length; i++) {
    const numero = i + 1;
    let registro: Atestacion;
    try {
      registro = JSON.parse(lineas[i] as string) as Atestacion;
    } catch {
      return { ok: false, registros: lineas.length, primerRoto: { linea: numero, motivo: "la línea no es JSON válido" }, cabeza: previo };
    }
    if (registro.anterior !== previo) {
      return {
        ok: false,
        registros: lineas.length,
        primerRoto: { linea: numero, motivo: "el campo anterior no coincide con el registro previo: falta, sobra o cambió de orden una línea" },
        cabeza: previo,
      };
    }
    if (hashDe(registro) !== registro.hash) {
      return {
        ok: false,
        registros: lineas.length,
        primerRoto: { linea: numero, motivo: "el contenido no coincide con su hash: el registro fue alterado" },
        cabeza: previo,
      };
    }
    previo = registro.hash;
  }
  return { ok: true, registros: lineas.length, primerRoto: null, cabeza: previo };
}

// The head is what a merchant keeps outside the file (a note, a published timestamp).
// Comparing it later shows removals at the end, which the chain alone cannot see.
export function exportarCabeza(datos: string): { cabeza: string; registros: number } {
  const registros = leerAtestaciones(datos);
  const ultimo = registros[registros.length - 1];
  return { cabeza: ultimo ? ultimo.hash : HASH_INICIAL, registros: registros.length };
}

import { createHash, randomBytes, randomUUID } from "node:crypto";

// Two hooks for demonstrations and tests. Neither is set in normal use.
//   LEDGER_AHORA   fixed clock, an ISO date-time such as 2026-10-12T18:00:00Z.
//   LEDGER_SEMILLA makes ticket suffixes and codigoGeneracion reproducible.

export function ahora(): Date {
  const valor = process.env.LEDGER_AHORA;
  if (valor === undefined || valor === "") return new Date();
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) throw new Error(`LEDGER_AHORA no es una fecha ISO válida: ${valor}`);
  return fecha;
}

function hashHex(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

// Four hex characters for a ticket id.
export function sufijoTicket(clave: string): string {
  const semilla = process.env.LEDGER_SEMILLA;
  if (!semilla) return randomBytes(2).toString("hex").toUpperCase();
  return hashHex(`${semilla}|ticket|${clave}`).slice(0, 4).toUpperCase();
}

// An upper-case UUID in the shape codigoGeneracion requires.
export function codigoGeneracionNuevo(clave: string): string {
  const semilla = process.env.LEDGER_SEMILLA;
  if (!semilla) return randomUUID().toUpperCase();
  const h = hashHex(`${semilla}|dte|${clave}`).toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-A${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Helpers shared by the test files. Nothing here runs in the CLI.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { raizLedger } from "./datos.ts";
import type { Emisor } from "./dte/construir.ts";
import { pagoDesdeBlink } from "./pagos/blink.ts";
import { pagoEfectivo } from "./pagos/efectivo.ts";
import type { PagoEfectivo, PagoLightning } from "./pagos/tipos.ts";
import { crearTicket, registrarPago, totalDeTicket, validarEntrada, type EntradaTicket, type Ticket } from "./ticket.ts";

export function leerFixture<T = unknown>(nombre: string): T {
  return JSON.parse(readFileSync(join(raizLedger(), "fixtures", nombre), "utf8")) as T;
}

// Helpers default to the 2026 fixtures, which the 2026 tests expect. Pass "caso" for the caso fixtures.
export function emisorPrueba(generacion: "caso" | "2026" = "2026"): Emisor {
  return generacion === "caso" ? leerFixture<Emisor>("caso/emisor.json") : leerFixture<Emisor>("emisor.json");
}

export function entradaConsumidor(): EntradaTicket {
  return validarEntrada(leerFixture("ticket-consumidor.json"));
}

export function entradaContribuyente(generacion: "caso" | "2026" = "2026"): EntradaTicket {
  return validarEntrada(leerFixture(generacion === "caso" ? "caso/ticket-contribuyente.json" : "ticket-contribuyente.json"));
}

export const AHORA = new Date("2026-10-13T13:40:00.000Z");

export function ticketPagadoLightning(
  entrada: EntradaTicket,
  fixture = "blink-receive-lightning.json",
  id = "TK-20261013-0001",
): { ticket: Ticket; pago: PagoLightning } {
  const pago = pagoDesdeBlink(leerFixture(fixture));
  const ticket = registrarPago(crearTicket(entrada, AHORA, id), pago, AHORA);
  return { ticket, pago };
}

export function ticketPagadoEfectivo(entrada: EntradaTicket, id = "TK-20261013-0002"): { ticket: Ticket; pago: PagoEfectivo } {
  const abierto = crearTicket(entrada, AHORA, id);
  const pago = pagoEfectivo(totalDeTicket(abierto).totalCentavos, AHORA);
  return { ticket: registrarPago(abierto, pago, AHORA), pago };
}

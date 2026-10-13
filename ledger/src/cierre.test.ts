import { test } from "node:test";
import assert from "node:assert/strict";
import { leerFixture, entradaConsumidor } from "./ayudas-prueba.ts";
import { pagoDesdeBlink } from "./pagos/blink.ts";
import { pagoEfectivo } from "./pagos/efectivo.ts";
import { clasificarCierre, lineasCierre } from "./cierre.ts";
import { adjuntarDte, aceptarDte, crearTicket, registrarPago, rechazarDte, type Ticket } from "./ticket.ts";
import type { Atestacion } from "./atestacion.ts";

const HORA = 3_600_000;
const DTE = (n: number) => ({
  tipoDte: "01" as const,
  codigoGeneracion: `5A1C0E7B-3D4F-4A8E-9B2C-7F6E5D4C3B${String(n).padStart(2, "0")}`,
  numeroControl: `DTE-01-M001P001-${String(n).padStart(15, "0")}`,
  ambiente: "00" as const,
  archivo: `dte/01-${n}.json`,
});

// Tickets built through the same functions the CLI uses; each event carries its own instant.
function efectivo(id: string, creado: Date, pagado: Date): Ticket {
  const abierto = crearTicket(entradaConsumidor(), creado, id);
  return registrarPago(abierto, pagoEfectivo(452, pagado), pagado);
}

function conDte(t: Ticket, n: number, instante: Date): Ticket {
  return adjuntarDte(t, DTE(n), instante);
}

function rechazado(id: string, creado: Date, pagado: Date, rechazo: Date, n: number): Ticket {
  return rechazarDte(conDte(efectivo(id, creado, pagado), n, pagado), ["resumen.totalIva: no cuadra"], rechazo);
}

const DIA = "2026-10-13";
const CIERRE = new Date("2026-10-13T20:00:00.000Z"); // 14:00 in El Salvador

test("one ticket in each group: counts, the 23-hour and 25-hour fuses, and the answer", () => {
  const emitido = aceptarDte(
    conDte(efectivo("TK-20261013-5001", new Date("2026-10-13T15:00:00Z"), new Date("2026-10-13T15:02:00Z")), 1, new Date("2026-10-13T15:03:00Z")),
    { valor: "SIMULADO-0123456789ABCDEF0123456789ABCDEF01", momento: "2026-10-13T15:04:00.000Z", simulado: true },
    new Date("2026-10-13T15:04:00Z"),
  );
  const huerfano = efectivo("TK-20261013-5002", new Date("2026-10-13T15:10:00Z"), new Date("2026-10-13T15:11:00Z"));
  const r23 = rechazado("TK-20261013-5003", new Date("2026-10-12T14:00:00Z"), new Date("2026-10-12T14:01:00Z"), new Date(CIERRE.getTime() - 23 * HORA), 3);
  const r25 = rechazado("TK-20261013-5004", new Date("2026-10-12T14:00:00Z"), new Date("2026-10-12T14:01:00Z"), new Date(CIERRE.getTime() - 25 * HORA), 4);
  const abierto = crearTicket(entradaConsumidor(), new Date("2026-10-13T16:00:00Z"), "TK-20261013-5005");
  const informe = clasificarCierre({ fecha: DIA, ahora: CIERRE, tickets: [emitido, huerfano, r23, r25, abierto], atestaciones: [] });

  assert.equal(informe.grupos.emitidos.length, 1);
  assert.equal(informe.grupos.huerfanos.length, 1);
  assert.equal(informe.grupos.plazo.length, 2);
  assert.equal(informe.grupos.abiertos.length, 1);
  assert.equal(informe.grupos.emitidos[0]?.selloSimulado?.startsWith("SIMULADO-"), true);

  const [primero, segundo] = informe.grupos.plazo;
  assert.equal(primero?.ticket, "TK-20261013-5004", "the expired fuse sorts first");
  assert.equal(primero?.vencido, true);
  assert.equal(segundo?.ticket, "TK-20261013-5003");
  assert.equal(segundo?.minutosRestantes, 60);
  assert.equal(segundo?.vencido, false);

  assert.equal(informe.pendientes, 3);
  assert.equal(informe.todosConSello, false);
  assert.equal(informe.respuesta, "¿Todos los cobros de hoy tienen su sello? No: 3 cobros sin documento válido.");
  const texto = lineasCierre(informe).join("\n");
  assert.match(texto, /  quedan 1 h  TK-20261013-5003/);
  assert.match(texto, /plazo vencido hace 1 h  TK-20261013-5004/);
});

test("each ticket appears in exactly one group", () => {
  const huerfano = efectivo("TK-20261013-5010", new Date("2026-10-13T15:10:00Z"), new Date("2026-10-13T15:11:00Z"));
  const r = rechazado("TK-20261013-5011", new Date("2026-10-13T15:10:00Z"), new Date("2026-10-13T15:11:00Z"), new Date("2026-10-13T15:30:00Z"), 11);
  const informe = clasificarCierre({ fecha: DIA, ahora: CIERRE, tickets: [huerfano, r], atestaciones: [] });
  const todos = [...informe.grupos.emitidos, ...informe.grupos.huerfanos, ...informe.grupos.plazo, ...informe.grupos.abiertos].map((f) => f.ticket);
  assert.equal(new Set(todos).size, todos.length);
  assert.equal(todos.length, 2);
});

test("a ticket paid at 23:59 on the day belongs to that day; one paid at 00:01 belongs to the next", () => {
  const antes = efectivo("TK-20261013-5020", new Date("2026-10-13T23:50:00-06:00"), new Date("2026-10-13T23:59:00-06:00"));
  const despues = efectivo("TK-20261013-5021", new Date("2026-10-14T00:00:30-06:00"), new Date("2026-10-14T00:01:00-06:00"));
  const cierreDia = new Date("2026-10-14T06:30:00Z");
  const del13 = clasificarCierre({ fecha: "2026-10-13", ahora: cierreDia, tickets: [antes, despues], atestaciones: [] });
  assert.deepEqual(del13.grupos.huerfanos.map((f) => f.ticket), ["TK-20261013-5020"]);
  const del14 = clasificarCierre({ fecha: "2026-10-14", ahora: cierreDia, tickets: [antes, despues], atestaciones: [] });
  // The 13th orphan is still unresolved, so it carries into the next close; the 14th sale joins it.
  assert.deepEqual(del14.grupos.huerfanos.map((f) => f.ticket), ["TK-20261013-5020", "TK-20261013-5021"]);
});

test("an empty day answers yes with zero totals", () => {
  const informe = clasificarCierre({ fecha: "2026-10-01", ahora: CIERRE, tickets: [], atestaciones: [] });
  assert.equal(informe.todosConSello, true);
  assert.equal(informe.respuesta, "¿Todos los cobros de hoy tienen su sello? Sí.");
  for (const g of ["emitidos", "huerfanos", "plazo", "abiertos"] as const) assert.equal(informe.totales[g].cantidad, 0);
});

test("Bitcoin totals show sats from the attestation next to the dollars", () => {
  const pago = pagoDesdeBlink(leerFixture("blink-receive-lightning.json"));
  const abierto = crearTicket(entradaConsumidor(), new Date("2026-10-12T18:00:00Z"), "TK-20261012-5030");
  const pagado = registrarPago(abierto, pago, new Date("2026-10-12T18:41:07Z"));
  const atestacion = { ticket: "TK-20261012-5030", sats: 12236 } as Atestacion;
  const informe = clasificarCierre({ fecha: "2026-10-12", ahora: CIERRE, tickets: [pagado], atestaciones: [atestacion] });
  assert.equal(informe.totales.huerfanos.porRail.lightning.sats, 12236);
  assert.equal(informe.totales.huerfanos.porRail.lightning.usdCentavos, 452);
  assert.equal(informe.grupos.huerfanos[0]?.sats, 12236);
});

test("open tickets carry their total in the Abiertos group, marked as not paid", () => {
  const abierto = crearTicket(entradaConsumidor(), new Date("2026-10-13T16:00:00Z"), "TK-20261013-5040");
  const informe = clasificarCierre({ fecha: DIA, ahora: CIERRE, tickets: [abierto], atestaciones: [] });
  assert.equal(informe.totales.abiertos.cantidad, 1);
  assert.equal(informe.totales.abiertos.usdCentavos, 452);
  assert.match(lineasCierre(informe).join("\n"), /TK-20261013-5040  2026-10-13  \$4\.52 sin pagar  creado, sin pago/);
});

test("a Lightning orphan says why it has no attestation, and its sats come from the payment", () => {
  const pago = pagoDesdeBlink(leerFixture("blink-receive-lightning.json"));
  const pagado = registrarPago(crearTicket(entradaConsumidor(), new Date("2026-10-12T18:00:00Z"), "TK-20261012-5041"), pago, new Date("2026-10-12T18:41:07Z"));
  const informe = clasificarCierre({ fecha: "2026-10-12", ahora: CIERRE, tickets: [pagado], atestaciones: [] });
  const texto = lineasCierre(informe).join("\n");
  assert.match(texto, /TK-20261012-5041  2026-10-12  \$4\.52 \(12,236 sats\) Lightning  sin documento: nunca se construyó, así que aún no hay atestación; los sats son del pago/);
  assert.equal(informe.grupos.huerfanos[0]?.sats, 12236);
});

test("the time left is the first thing on a rejected line, in hours or minutes", () => {
  // Rejected 26 hours before the close: the fuse ended 2 hours ago. Rejected 23 h 20 min before: 40 minutes left.
  const r = rechazado("TK-20261013-5050", new Date("2026-10-12T14:00:00Z"), new Date("2026-10-12T14:01:00Z"), new Date(CIERRE.getTime() - 26 * HORA), 50);
  const r2 = rechazado("TK-20261013-5051", new Date("2026-10-12T14:00:00Z"), new Date("2026-10-12T14:01:00Z"), new Date(CIERRE.getTime() - 23 * HORA - 20 * 60_000), 51);
  const informe = clasificarCierre({ fecha: DIA, ahora: CIERRE, tickets: [r, r2], atestaciones: [] });
  const lineas = lineasCierre(informe);
  assert.ok(lineas.some((l) => l.startsWith("  plazo vencido hace 2 h  TK-20261013-5050")));
  assert.ok(lineas.some((l) => l.startsWith("  quedan 40 min  TK-20261013-5051")));
});

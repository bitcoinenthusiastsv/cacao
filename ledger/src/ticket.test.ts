import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pagoEfectivo } from "./pagos/efectivo.ts";
import {
  adjuntarDte,
  crearTicket,
  guardarTicket,
  leerTicket,
  listarTickets,
  registrarPago,
  totalDeTicket,
  validarEntrada,
} from "./ticket.ts";
import { AHORA, entradaConsumidor, entradaContribuyente, leerFixture } from "./ayudas-prueba.ts";

test("a ticket is stored as one JSON file and reads back unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-ticket-"));
  try {
    const ticket = crearTicket(entradaConsumidor(), AHORA, "TK-20261013-AB12");
    guardarTicket(dir, ticket);
    assert.deepEqual(leerTicket(dir, "TK-20261013-AB12"), ticket);
    assert.equal(listarTickets(dir).length, 1);
    assert.equal(ticket.estado, "abierto");
    assert.equal(ticket.lineas[0]?.precioCentavos, 113);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ticket ids must have the TK-AAAAMMDD-XXXX form, which also blocks path tricks", () => {
  assert.throws(() => crearTicket(entradaConsumidor(), AHORA, "../fuera"), /no es un identificador de ticket/);
  const dir = mkdtempSync(join(tmpdir(), "ledger-ticket-"));
  try {
    assert.throws(() => leerTicket(dir, "TK-2026-AB12"), /no es un identificador/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a generated id uses the El Salvador date", () => {
  const ticket = crearTicket(entradaConsumidor(), new Date("2026-10-13T02:30:00.000Z"));
  assert.match(ticket.id, /^TK-20261012-[0-9A-F]{4}$/);
});

test("payment must equal the ticket total exactly", () => {
  const ticket = crearTicket(entradaConsumidor(), AHORA, "TK-20261013-0003");
  assert.throws(() => registrarPago(ticket, pagoEfectivo(451, AHORA), AHORA), /suma \$4\.52; deben coincidir/);
  const pagado = registrarPago(ticket, pagoEfectivo(452, AHORA), AHORA);
  assert.equal(pagado.estado, "pagado");
  assert.throws(() => registrarPago(pagado, pagoEfectivo(452, AHORA), AHORA), /solo un ticket abierto/);
});

test("a document can only be attached to a paid ticket, once", () => {
  const ticket = crearTicket(entradaConsumidor(), AHORA, "TK-20261013-0004");
  const ref = {
    tipoDte: "01" as const,
    codigoGeneracion: "CF13B01C-9DAF-47E4-8CBB-E44C73A00A3E",
    numeroControl: "DTE-01-M001P001-000000000000001",
    ambiente: "00" as const,
    archivo: "dte/01-x.json",
  };
  assert.throws(() => adjuntarDte(ticket, ref, AHORA), /solo un ticket pagado admite documento/);
  const pagado = registrarPago(ticket, pagoEfectivo(452, AHORA), AHORA);
  const conDte = adjuntarDte(pagado, ref, AHORA);
  assert.equal(conDte.dte?.numeroControl, ref.numeroControl);
  assert.throws(() => adjuntarDte(conDte, ref, AHORA), /ya tiene un documento/);
});

test("totals follow the customer type: consumer prices include IVA, business prices do not", () => {
  const consumidor = crearTicket(entradaConsumidor(), AHORA, "TK-20261013-0005");
  const contribuyente = crearTicket(entradaContribuyente(), AHORA, "TK-20261013-0006");
  assert.equal(totalDeTicket(consumidor).totalCentavos, 452);
  assert.equal(totalDeTicket(consumidor).ivaCentavos, 52);
  assert.equal(totalDeTicket(contribuyente).totalCentavos, 452);
  assert.equal(totalDeTicket(contribuyente).ivaCentavos, 52);
});

test("entries are checked: consumer tickets take no receptor, business tickets must have one", () => {
  const base = leerFixture<{ lineas: unknown[] }>("ticket-consumidor.json");
  assert.throws(
    () => validarEntrada({ ...base, cliente: "consumidor", receptor: { nit: "1" } }),
    /no lleva receptor/,
  );
  assert.throws(() => validarEntrada({ cliente: "contribuyente", lineas: base.lineas }), /receptor/);
  assert.throws(() => validarEntrada({ cliente: "otro", lineas: base.lineas }), /consumidor|contribuyente/);
  assert.throws(() => validarEntrada({ cliente: "consumidor", lineas: [] }), /al menos una línea/);
});

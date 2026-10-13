import { test } from "node:test";
import assert from "node:assert/strict";
import { AHORA, emisorPrueba, entradaConsumidor, entradaContribuyente, ticketPagadoEfectivo, ticketPagadoLightning } from "../ayudas-prueba.ts";
import { validarEntrada } from "../ticket.ts";
import { construir01, construir03, numeroControl } from "./construir.ts";
import { validarDte } from "../validar.ts";
import { pagoEfectivo } from "../pagos/efectivo.ts";
import { crearTicket, registrarPago } from "../ticket.ts";
import type { Emisor } from "./construir.ts";

type Doc = Record<string, any>;
const CODIGO = "5A1C0E7B-3D4F-4A8E-9B2C-7F6E5D4C3B2A";
const CODIGO_3 = "9C2E4B6A-1D3F-4E5A-8B7C-0A9F8E7D6C5B";

function opc(gen: "caso" | "2026", extra: Record<string, unknown> = {}) {
  return { correlativo: 1, ahora: AHORA, codigoGeneracion: CODIGO, generacion: gen, ...extra };
}

function caso01(): Doc {
  const { ticket, pago } = ticketPagadoLightning(entradaConsumidor(), "blink-receive-lightning.json", "TK-20261013-2001");
  return construir01(ticket, pago, emisorPrueba("caso"), opc("caso")).documento as Doc;
}

function caso03(): Doc {
  const { ticket, pago } = ticketPagadoLightning(entradaContribuyente("caso"), "blink-receive-lightning-ccf.json", "TK-20261013-2002");
  return construir03(ticket, pago, emisorPrueba("caso"), opc("caso", { codigoGeneracion: CODIGO_3 })).documento as Doc;
}

test("caso 01 uses the v1 shape: version 1, extension, ivaRete1 and reteRenta, no ivaRete or observaciones", () => {
  const doc = caso01();
  assert.equal(doc.identificacion.version, 1);
  assert.deepEqual(doc.extension, { nombEntrega: null, docuEntrega: null, nombRecibe: null, docuRecibe: null });
  assert.equal(doc.resumen.ivaRete1, 0);
  assert.equal(doc.resumen.reteRenta, 0);
  assert.equal("ivaRete" in doc.resumen, false);
  assert.equal("observaciones" in doc.resumen, false);
  assert.equal(validarDte(doc, { generacion: "caso" }).ok, true);
});

test("the 2026 01 has no extension block and keeps ivaRete and observaciones", () => {
  const { ticket, pago } = ticketPagadoEfectivo(entradaConsumidor(), "TK-20261013-2003");
  const doc = construir01(ticket, pago, emisorPrueba("2026"), opc("2026")).documento as Doc;
  assert.equal(doc.identificacion.version, 2);
  assert.equal("extension" in doc, false);
  assert.equal(doc.resumen.ivaRete, 0);
  assert.equal(doc.resumen.observaciones, null);
  assert.equal("ivaRete1" in doc.resumen, false);
});

test("caso 03 uses the v3 shape: ivaPerci1, ivaRete1, reteRenta, six-key extension, codEstableMH and codPuntoVentaMH", () => {
  const doc = caso03();
  assert.equal(doc.identificacion.version, 3);
  assert.equal(doc.resumen.ivaPerci1, 0);
  assert.equal(doc.resumen.ivaRete1, 0);
  assert.equal(doc.resumen.reteRenta, 0);
  assert.equal("ivaPerci" in doc.resumen, false);
  assert.equal("totalIva" in doc.resumen, false);
  assert.equal("observaciones" in doc.resumen, false);
  assert.deepEqual(Object.keys(doc.extension).sort(), ["docuEntrega", "docuRecibe", "nombEntrega", "nombRecibe", "observaciones", "placaVehiculo"]);
  assert.equal(doc.emisor.codEstableMH, null);
  assert.equal(doc.emisor.codPuntoVentaMH, null);
  assert.equal(doc.emisor.tipoEstablecimiento, "02");
  assert.equal(validarDte(doc, { generacion: "caso" }).ok, true);
});

test("caso drops distrito from every direccion; 2026 keeps it", () => {
  assert.equal("distrito" in (caso03().receptor.direccion as object), false);
  assert.equal("distrito" in (caso01().emisor.direccion as object), false);
  const { ticket, pago } = ticketPagadoEfectivo(entradaConsumidor(), "TK-20261013-2004");
  const doc = construir01(ticket, pago, emisorPrueba("2026"), opc("2026")).documento as Doc;
  assert.equal(doc.emisor.direccion.distrito, "Tamanique");
});

test("caso needs tipoEstablecimiento in the emisor; the 2026 emisor does not carry it", () => {
  const { ticket, pago } = ticketPagadoEfectivo(entradaConsumidor(), "TK-20261013-2005");
  const sinTipo: Emisor = { ...emisorPrueba("caso") };
  delete sinTipo.tipoEstablecimiento;
  assert.throws(() => construir01(ticket, pago, sinTipo, opc("caso")), /tipoEstablecimiento/);
  const doc = construir01(ticket, pago, emisorPrueba("2026"), opc("2026")).documento as Doc;
  assert.equal("tipoEstablecimiento" in doc.emisor, false);
});

test("caso 01 with a total of USD 200 or more is refused: the v1 schema then requires the receiver", () => {
  const entrada = validarEntrada({ cliente: "consumidor", lineas: [{ descripcion: "Televisor", cantidad: 1, precio: "200.00" }] });
  const { ticket, pago } = ticketPagadoEfectivo(entrada, "TK-20261013-2006");
  assert.throws(() => construir01(ticket, pago, emisorPrueba("caso"), opc("caso")), /USD 200/);
  // Under 2026 the same sale builds: the 2026 schema has no such condition.
  assert.equal(construir01(ticket, pago, emisorPrueba("2026"), opc("2026")).totales.totalCentavos, 20000);
});

test("caso 03 with a total of USD 20,000 or more is refused: the v3 schema then requires delivery data", () => {
  const entrada = validarEntrada({
    cliente: "contribuyente",
    receptor: entradaContribuyente("caso").receptor,
    lineas: [{ descripcion: "Bomba", cantidad: 1, precioCentavos: 2_000_000 }],
  });
  const abierto = crearTicket(entrada, AHORA, "TK-20261013-2007");
  const pago = pagoEfectivo(2_260_000, AHORA);
  const pagado = registrarPago(abierto, pago, AHORA);
  assert.throws(() => construir03(pagado, pago, emisorPrueba("caso"), opc("caso")), /USD 20,000/);
});

test("the same paid sale builds and validates under each generation, for both document types and both rails", () => {
  for (const gen of ["caso", "2026"] as const) {
    const emisor = emisorPrueba(gen);
    const consumidorLn = ticketPagadoLightning(entradaConsumidor(), "blink-receive-lightning.json", "TK-20261013-3001");
    const consumidorEf = ticketPagadoEfectivo(entradaConsumidor(), "TK-20261013-3002");
    const contribuyenteLn = ticketPagadoLightning(entradaContribuyente(gen), "blink-receive-lightning-ccf.json", "TK-20261013-3003");
    const contribuyenteEf = ticketPagadoEfectivo(entradaContribuyente(gen), "TK-20261013-3004");
    const casos = [
      construir01(consumidorLn.ticket, consumidorLn.pago, emisor, opc(gen)),
      construir01(consumidorEf.ticket, consumidorEf.pago, emisor, opc(gen, { correlativo: 2 })),
      construir03(contribuyenteLn.ticket, contribuyenteLn.pago, emisor, opc(gen, { correlativo: 3, codigoGeneracion: CODIGO_3 })),
      construir03(contribuyenteEf.ticket, contribuyenteEf.pago, emisor, opc(gen, { correlativo: 4, codigoGeneracion: "0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D" })),
    ];
    for (const r of casos) {
      const v = validarDte(r.documento, { generacion: gen });
      assert.equal(v.ok, true, `${gen} ${r.tipoDte}: ${JSON.stringify([...v.esquema, ...v.reglas].slice(0, 2))}`);
      assert.equal(r.totales.totalCentavos, 452, `${gen} ${r.tipoDte} totals agree`);
    }
    assert.equal(casos[0]?.formaPago.codigo, gen === "caso" ? "99" : "11");
    assert.equal(casos[1]?.formaPago.codigo, "01");
    assert.equal(casos[2]?.formaPago.codigo, "11");
    assert.equal(casos[3]?.formaPago.codigo, "01");
  }
});

test("numeroControl under caso accepts any four-character codes; 2026 keeps the strict M/B/S/P shape", () => {
  assert.equal(numeroControl("01", "MA01", "PX01", 1, "caso"), "DTE-01-MA01PX01-000000000000001");
  assert.throws(() => numeroControl("01", "MA01", "PX01", 1, "2026"), /M001/);
  assert.equal(numeroControl("03", "M001", "P001", 7, "2026"), "DTE-03-M001P001-000000000000007");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { AHORA, emisorPrueba, entradaConsumidor, entradaContribuyente, ticketPagadoEfectivo, ticketPagadoLightning } from "../ayudas-prueba.ts";
import { pagoEfectivo } from "../pagos/efectivo.ts";
import { crearTicket } from "../ticket.ts";
import { construir01, construir03, numeroControl } from "./construir.ts";
import { formaDePago, referenciaLightning } from "./forma-de-pago.ts";
import { validarDte, type OpcionesValidacion } from "../validar.ts";
// The generation these tests describe. Caso-specific tests name caso explicitly.
function validarDte2026(doc: unknown, extra: OpcionesValidacion = {}) {
  return validarDte(doc, { ...extra, generacion: "2026" });
}


const CODIGO = "5A1C0E7B-3D4F-4A8E-9B2C-7F6E5D4C3B2A";

function opciones(extra: Record<string, unknown> = {}) {
  return { correlativo: 1, ahora: AHORA, codigoGeneracion: CODIGO, generacion: "2026" as const, ...extra };
}

test("numeroControl has the prefix, type, eight characters and a 15-digit correlative", () => {
  assert.equal(numeroControl("01", "M001", "P001", 1), "DTE-01-M001P001-000000000000001");
  assert.equal(numeroControl("03", "M001", "P001", 42), "DTE-03-M001P001-000000000000042");
  assert.throws(() => numeroControl("01", "001", "P001", 1), /M001/);
  assert.throws(() => numeroControl("01", "M001", "P001", 0), /entre 1 y/);
});

test("forma de pago follows the rail: cash 01, Lightning 11 on 03, 99 on 01", () => {
  const { pago } = ticketPagadoLightning(entradaConsumidor());
  assert.equal(formaDePago(pagoEfectivo(452, AHORA), "01").codigo, "01");
  assert.equal(formaDePago(pago, "03").codigo, "11");
  assert.equal(formaDePago(pago, "01").codigo, "99");
  assert.equal(formaDePago(pago, "01", "11").codigo, "11");
});

test("the referencia for Lightning names the sats, the rate and the hash prefix, within 50 characters", () => {
  const { pago } = ticketPagadoLightning(entradaConsumidor());
  const ref = referenciaLightning(pago);
  assert.equal(ref, "BTC-LN|12236sat|36940.18|bf6b61f814b2");
  assert.ok(ref.length <= 50);
});

test("factura 01 from a Lightning sale: builds, passes the official schema and the CacaoLedger rules", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaConsumidor());
  const r = construir01(ticket, pago, emisorPrueba("caso"), opciones({ generacion: "caso" }));
  assert.equal(r.formaPago.codigo, "99");
  assert.equal(r.numeroControl, "DTE-01-M001P001-000000000000001");
  const v = validarDte(r.documento, { generacion: "caso" });
  assert.deepEqual(v.esquema, []);
  assert.deepEqual(v.reglas, []);
  assert.equal(v.ok, true);
});

test("CCF 03 from a Lightning sale: uses 11 and passes both layers", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaContribuyente(), "blink-receive-lightning-ccf.json", "TK-20261013-0010");
  const r = construir03(ticket, pago, emisorPrueba(), opciones());
  assert.equal(r.formaPago.codigo, "11");
  const v = validarDte2026(r.documento);
  assert.equal(v.ok, true, JSON.stringify(v));
});

test("the same demo sale as 01 and 03 (cash) passes both schemas and both carry $4.52", () => {
  const { ticket: t01, pago: p01 } = ticketPagadoEfectivo(entradaConsumidor(), "TK-20261013-0011");
  const { ticket: t03, pago: p03 } = ticketPagadoEfectivo(entradaContribuyente(), "TK-20261013-0012");
  const a = construir01(t01, p01, emisorPrueba(), opciones());
  const b = construir03(t03, p03, emisorPrueba(), opciones({ correlativo: 2 }));
  assert.equal(a.totales.totalCentavos, 452);
  assert.equal(b.totales.totalCentavos, 452);
  assert.equal(a.formaPago.codigo, "01");
  assert.equal(b.formaPago.codigo, "01");
  assert.equal(validarDte2026(a.documento).ok, true);
  assert.equal(validarDte2026(b.documento).ok, true);
});

test("the 01 document carries IVA inside the price and the totals agree with the lines", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaConsumidor());
  const doc = construir01(ticket, pago, emisorPrueba(), opciones()).documento;
  const resumen = doc.resumen as Record<string, unknown>;
  const lineas = doc.cuerpoDocumento as Record<string, unknown>[];
  assert.equal(resumen.totalGravada, 4.52);
  assert.equal(resumen.totalIva, 0.52);
  assert.equal(resumen.montoTotalOperacion, 4.52);
  assert.equal(resumen.totalPagar, 4.52);
  assert.equal(lineas.length, 2);
  assert.equal(lineas[0]?.ivaItem, 0.26);
  assert.equal(lineas[0]?.ventaGravada, 2.26);
});

test("the 03 document keeps prices net, adds 13 % in tributos and has no ivaItem", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaContribuyente(), "blink-receive-lightning-ccf.json", "TK-20261013-0013");
  const doc = construir03(ticket, pago, emisorPrueba(), opciones()).documento;
  const resumen = doc.resumen as Record<string, unknown>;
  const lineas = doc.cuerpoDocumento as Record<string, unknown>[];
  assert.equal(resumen.totalGravada, 4);
  assert.deepEqual(resumen.tributos, [{ codigo: "20", descripcion: "Impuesto al Valor Agregado 13%", valor: 0.52 }]);
  assert.equal(resumen.montoTotalOperacion, 4.52);
  assert.equal("ivaItem" in (lineas[0] ?? {}), false);
});

test("under 2026 an 01 forcing code 11 passes the schema and the rules, and carries a warning", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaConsumidor());
  const r = construir01(ticket, pago, emisorPrueba(), opciones({ forzarCodigo: "11" }));
  const v = validarDte2026(r.documento);
  assert.equal(v.esquema.length, 0, "the official 01 v2 schema does not restrict codigo");
  assert.equal(v.reglas.length, 0, "the 11 rule belongs to caso only");
  assert.equal(v.ok, true);
  assert.equal(v.avisos.length, 1);
  assert.match(v.avisos[0] ?? "", /no fue probada/);
});

test("under caso an 01 forcing code 11 fails the official pattern and the CacaoLedger rule", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaConsumidor());
  const r = construir01(ticket, pago, emisorPrueba("caso"), opciones({ forzarCodigo: "11", generacion: "caso" }));
  const v = validarDte(r.documento, { generacion: "caso" });
  assert.equal(v.archivoEsquema, "espejo-herson/DTE-FE-v1.json");
  const pattern = v.esquema.find((f) => f.ruta === "resumen.pagos[0].codigo");
  assert.equal(pattern?.regla, "pattern", "the official layer refuses 11 on 01 v1");
  assert.match(pattern?.mensaje ?? "", /\^\(0\[1-9\]\|\|10\|\|99\)\$/);
  assert.equal(pattern?.valor, '"11"');
  const fallo = v.reglas.find((f) => f.ruta === "resumen.pagos[0].codigo");
  assert.match(fallo?.mensaje ?? "", /Bitcoin \(11\) no se declara en una factura de consumidor final \(01\)/);
  assert.equal(v.ok, false);
});

test("a Lightning 01 without forcing and a cash 01 both avoid the rule", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaConsumidor(), "blink-receive-lightning.json", "TK-20261013-0014");
  assert.equal(validarDte2026(construir01(ticket, pago, emisorPrueba(), opciones()).documento).ok, true);
  const efectivo = ticketPagadoEfectivo(entradaConsumidor(), "TK-20261013-0015");
  assert.equal(validarDte2026(construir01(efectivo.ticket, efectivo.pago, emisorPrueba(), opciones()).documento).ok, true);
});

test("the test environment is the default; production needs an explicit confirmation", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaConsumidor(), "blink-receive-lightning.json", "TK-20261013-0016");
  const r = construir01(ticket, pago, emisorPrueba(), opciones());
  assert.equal(r.ambiente, "00");
  assert.throws(() => construir01(ticket, pago, emisorPrueba(), opciones({ ambiente: "01" })), /requiere --confirmar-produccion/);
  const prod = construir01(ticket, pago, emisorPrueba(), opciones({ ambiente: "01", confirmarProduccion: true }));
  assert.equal(prod.documento.identificacion && (prod.documento.identificacion as Record<string, unknown>).ambiente, "01");
});

test("a ticket of one customer type cannot produce the other document", () => {
  const { ticket, pago } = ticketPagadoEfectivo(entradaConsumidor(), "TK-20261013-0017");
  assert.throws(() => construir03(ticket, pago, emisorPrueba(), opciones()), /produce la factura 01/);
});

test("a ticket that is not paid cannot produce a document", () => {
  const abierto = crearTicket(entradaConsumidor(), AHORA, "TK-20261013-0018");
  const pago = pagoEfectivo(452, AHORA);
  assert.throws(() => construir01(abierto, pago, emisorPrueba(), opciones()), /debe estar pagado/);
});


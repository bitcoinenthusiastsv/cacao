import { test } from "node:test";
import assert from "node:assert/strict";
import { AHORA, emisorPrueba, entradaConsumidor, ticketPagadoEfectivo, ticketPagadoLightning } from "./ayudas-prueba.ts";
import { construir01 } from "./dte/construir.ts";
import { recibir, selloSimulado } from "./recepcion-simulada.ts";

const CODIGO = "5A1C0E7B-3D4F-4A8E-9B2C-7F6E5D4C3B2A";

function docCaso(): Record<string, any> {
  const { ticket, pago } = ticketPagadoEfectivo(entradaConsumidor(), "TK-20261013-4001");
  return JSON.parse(JSON.stringify(construir01(ticket, pago, emisorPrueba("caso"), { correlativo: 1, ahora: AHORA, codigoGeneracion: CODIGO, generacion: "caso" }).documento));
}

test("an accepted document gets a seal that starts SIMULADO- followed by 34 upper-case hex characters", () => {
  const r = recibir(docCaso(), AHORA);
  assert.equal(r.aceptado, true);
  assert.match(r.sello ?? "", /^SIMULADO-[0-9A-F]{34}$/);
  assert.equal(r.momento, AHORA.toISOString());
  assert.deepEqual(r.observaciones, []);
});

test("the seal is reproducible: the same document always gets the same seal", () => {
  const doc = docCaso();
  assert.equal(selloSimulado(doc), selloSimulado(JSON.parse(JSON.stringify(doc))));
  const otro = JSON.parse(JSON.stringify(doc));
  otro.identificacion.codigoGeneracion = "0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D";
  assert.notEqual(selloSimulado(doc), selloSimulado(otro));
});

test("a document that fails validation is refused with its observations and no seal", () => {
  const doc = docCaso();
  doc.resumen.totalIva = 0.5;
  const r = recibir(doc, AHORA);
  assert.equal(r.aceptado, false);
  assert.equal(r.sello, null);
  assert.ok(r.observaciones.some((o) => o.startsWith("resumen.totalIva")));
});

test("the test reception refuses production documents", () => {
  const doc = docCaso();
  doc.identificacion.ambiente = "01";
  const r = recibir(doc, AHORA);
  assert.equal(r.aceptado, false);
  assert.ok(r.observaciones.some((o) => o.startsWith("identificacion.ambiente")));
});

test("a caso 01 with Bitcoin code 11 is refused by the reception", () => {
  const { ticket, pago } = ticketPagadoLightning(entradaConsumidor(), "blink-receive-lightning.json", "TK-20261013-4002");
  const doc = construir01(ticket, pago, emisorPrueba("caso"), { correlativo: 1, ahora: AHORA, codigoGeneracion: CODIGO, generacion: "caso", forzarCodigo: "11" }).documento;
  const r = recibir(doc, AHORA);
  assert.equal(r.aceptado, false);
  assert.ok(r.observaciones.some((o) => o.startsWith("resumen.pagos[0].codigo")));
});

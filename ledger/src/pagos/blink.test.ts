import { test } from "node:test";
import assert from "node:assert/strict";
import { leerFixture } from "../ayudas-prueba.ts";
import { pagoDesdeBlink } from "./blink.ts";

type Payload = { transaction: Record<string, unknown> } & Record<string, unknown>;

function conCambios(cambios: Record<string, unknown>, sobre: Partial<Payload> = {}): unknown {
  const base = leerFixture<Payload>("blink-receive-lightning.json");
  const tx = { ...base.transaction, ...cambios };
  return { ...base, ...sobre, transaction: tx };
}

test("the Blink fixture becomes a lightning Pago with sats, USD, rate and hash", () => {
  const pago = pagoDesdeBlink(leerFixture("blink-receive-lightning.json"));
  assert.equal(pago.rail, "lightning");
  assert.equal(pago.montoCentavos, 452);
  assert.equal(pago.sats, 12236);
  assert.equal(pago.tasaUsdPorBtc, "36940.18");
  assert.equal(pago.paymentHash, "bf6b61f814b2e2284f5cbb7c9f9e67887018ffe3f53bedb9b70dec0a15ebca1c");
  assert.equal(pago.idTransaccion, "655cd1926445716f60b89418");
  assert.equal(pago.momento, "2026-10-12T18:41:07.312Z");
});

test("the rate is the USD amount divided by the sats, not the display price", () => {
  // 1.00 USD for 2707 sats (the documented example) is about 36,941 USD per BTC.
  const pago = pagoDesdeBlink(conCambios({ settlementAmount: 2707, settlementDisplayAmount: "1.00" }));
  assert.equal(pago.tasaUsdPorBtc, "36941.26");
});

test("a payment that is not settled, or not in BTC, is refused", () => {
  assert.throws(() => pagoDesdeBlink(conCambios({ status: "pending" })), /no está liquidado/);
  assert.throws(() => pagoDesdeBlink(conCambios({ settlementCurrency: "USD" })), /se esperaba BTC/);
});

test("the event must be receive.lightning", () => {
  assert.throws(() => pagoDesdeBlink(conCambios({}, { eventType: "send.lightning" })), /se esperaba "receive.lightning"/);
});

test("a malformed payment hash or amount is refused", () => {
  assert.throws(
    () => pagoDesdeBlink(conCambios({ initiationVia: { paymentHash: "ABC", type: "lightning" } })),
    /payment hash/,
  );
  assert.throws(() => pagoDesdeBlink(conCambios({ settlementAmount: 0 })), /entero mayor que cero/);
  assert.throws(() => pagoDesdeBlink(conCambios({ settlementDisplayAmount: "4.5" })), /no es válido/);
});

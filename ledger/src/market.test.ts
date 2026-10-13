import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerFixture, AHORA } from "./ayudas-prueba.ts";
import { raizLedger } from "./datos.ts";
import { importarOrdenMarket, leerOrdenMarket } from "./market.ts";
import { leerTicket, listarTickets } from "./ticket.ts";

const CLI = join(raizLedger(), "src", "cli.ts");

function pedido(): Record<string, any> {
  return structuredClone(leerFixture("market-orden-1042.json")) as Record<string, any>;
}

function conDatos(fn: (datos: string) => void): void {
  const datos = mkdtempSync(join(tmpdir(), "ledger-market-"));
  try {
    fn(datos);
  } finally {
    rmSync(datos, { recursive: true, force: true });
  }
}

test("the order of the fixture becomes a paid ticket with its lines, its Lightning payment and its order number", () => {
  conDatos((datos) => {
    const r = importarOrdenMarket(datos, leerFixture("market-orden-1042.json"), AHORA);
    assert.equal(r.nueva, true);
    const t = r.ticket;
    assert.equal(t.estado, "pagado");
    assert.equal(t.cliente, "consumidor");
    assert.deepEqual(t.origen, { plataforma: "cacaomarket", numero: "1042" });
    assert.equal(t.lineas.length, 2);
    assert.equal(t.lineas[0]?.precioCentavos, 650);
    assert.equal(t.pago?.rail, "lightning");
    assert.equal(t.pago?.montoCentavos, 1775);
    assert.equal(t.pago?.rail === "lightning" ? t.pago.sats : 0, 48051);
    assert.equal(t.pago?.rail === "lightning" ? t.pago.tasaUsdPorBtc : "", "36939.92");
    assert.equal(leerTicket(datos, t.id).origen?.numero, "1042", "the order number is kept on the ticket");
  });
});

test("importing the same order twice writes one ticket and says so", () => {
  conDatos((datos) => {
    const primera = importarOrdenMarket(datos, leerFixture("market-orden-1042.json"), AHORA);
    const segunda = importarOrdenMarket(datos, leerFixture("market-orden-1042.json"), AHORA);
    assert.equal(segunda.nueva, false);
    assert.equal(segunda.ticket.id, primera.ticket.id);
    assert.equal(listarTickets(datos).length, 1);
    assert.equal(readdirSync(join(datos, "tickets")).length, 1);
  });
});

test("an order number imported again with different content is refused", () => {
  conDatos((datos) => {
    importarOrdenMarket(datos, leerFixture("market-orden-1042.json"), AHORA);
    const cambiado = pedido();
    // Same order number, one line more: a consistent total, sats and rate, but other content.
    cambiado.lineas[1].cantidad = 2;
    cambiado.totalCentavos = 2250;
    cambiado.pago.sats = 60910;
    cambiado.pago.tasaUsdPorBtc = "36939.75";
    cambiado.pago.paymentHash = "1".repeat(64);
    assert.throws(() => importarOrdenMarket(datos, cambiado, AHORA), /ya está importado como TK-.* con otro contenido/);
    assert.equal(listarTickets(datos).length, 1);
  });
});

test("a payment hash that already settles another ticket is refused", () => {
  conDatos((datos) => {
    importarOrdenMarket(datos, leerFixture("market-orden-1042.json"), AHORA);
    const otro = pedido();
    otro.numero = "1043";
    assert.throws(() => importarOrdenMarket(datos, otro, AHORA), /ya cubre el ticket TK-/);
  });
});

test("the order must add up: lines against the total", () => {
  const o = pedido();
  o.totalCentavos = 1800;
  assert.throws(() => leerOrdenMarket(o), /La suma de las líneas es \$17\.75 y el total del pedido dice \$18\.00; no cuadran\./);
});

test("negative and zero values are refused with one sentence", () => {
  const negativo = pedido();
  negativo.lineas[0].precioCentavos = -650;
  assert.throws(() => leerOrdenMarket(negativo), /El precio de la línea 1 debe ser un monto en centavos mayor que cero\./);
  const cero = pedido();
  cero.lineas[0].cantidad = 0;
  assert.throws(() => leerOrdenMarket(cero), /La cantidad de la línea 1 debe ser un entero mayor que cero\./);
  const total = pedido();
  total.totalCentavos = -1775;
  assert.throws(() => leerOrdenMarket(total), /El total del pedido debe ser un monto en centavos mayor que cero\./);
});

test("an order without its payment is refused", () => {
  const o = pedido();
  delete o.pago;
  assert.throws(() => leerOrdenMarket(o), /no trae el pago/);
});

test("a rate that does not match the amount and the sats is refused", () => {
  const o = pedido();
  o.pago.tasaUsdPorBtc = "36000.00";
  assert.throws(() => leerOrdenMarket(o), /La tasa 36000\.00 no cuadra con \$17\.75 y 48,051 sats: esos montos dan 36939\.92\./);
});

test("unknown fields, the wrong format and malformed hashes are refused", () => {
  const typo = pedido();
  typo.totalCentavo = typo.totalCentavos;
  assert.throws(() => leerOrdenMarket(typo), /campo que no conoce en el pedido: "totalCentavo"/);
  const formato = pedido();
  formato.formato = "cacaomarket-orden/2";
  assert.throws(() => leerOrdenMarket(formato), /no es un pedido de CacaoMarket con formato "cacaomarket-orden\/1"/);
  const hash = pedido();
  hash.pago.paymentHash = "ABC";
  assert.throws(() => leerOrdenMarket(hash), /64 caracteres hexadecimales en minúscula/);
});

test("contribuyente orders are refused for now, with the reason", () => {
  const o = pedido();
  o.tipoCliente = "contribuyente";
  assert.throws(() => leerOrdenMarket(o), /Por ahora solo se importan pedidos de consumidor final/);
});

test("an order paid in cash imports without any Lightning fields", () => {
  conDatos((datos) => {
    const o = {
      formato: "cacaomarket-orden/1",
      numero: "2001",
      pagadaEn: "2026-10-12T18:40:00.000Z",
      lineas: [{ descripcion: "Panela de caña, 1 lb", cantidad: 3, precioCentavos: 125 }],
      totalCentavos: 375,
      pago: { riel: "efectivo" },
    };
    const r = importarOrdenMarket(datos, o, AHORA);
    assert.equal(r.ticket.pago?.rail, "efectivo");
    assert.equal(r.ticket.pago?.montoCentavos, 375);
    assert.throws(() => leerOrdenMarket({ ...o, pago: { riel: "efectivo", sats: 5 } }), /campo que no conoce en pago: "sats"/);
  });
});

test("the CLI imports the order, and a second run reports the existing ticket with exit 0", () => {
  conDatos((datos) => {
    const archivo = join(raizLedger(), "fixtures", "market-orden-1042.json");
    const env = { ...process.env, LEDGER_AHORA: "2026-10-12T18:25:00Z", LEDGER_SEMILLA: "pruebas-market" };
    const primera = spawnSync(process.execPath, [CLI, "importar", "market", archivo, "--datos", datos], { encoding: "utf8", env });
    assert.equal(primera.status, 0, primera.stderr);
    assert.match(primera.stdout, /Pedido de CacaoMarket 1042 importado como ticket TK-20261012-/);
    const segunda = spawnSync(process.execPath, [CLI, "importar", "market", archivo, "--datos", datos], { encoding: "utf8", env });
    assert.equal(segunda.status, 0, segunda.stderr);
    assert.match(segunda.stdout, /El pedido 1042 ya estaba importado como TK-20261012-.*no se creó otro ticket/);
    assert.equal(listarTickets(datos).length, 1);
  });
});

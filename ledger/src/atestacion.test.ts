import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonico, exportarCabeza, HASH_INICIAL, registrarAtestacion, rutaAtestaciones, verificarCadena, type DatosAtestacion } from "./atestacion.ts";

function conDatos(fn: (datos: string) => void): void {
  const datos = mkdtempSync(join(tmpdir(), "ledger-atest-"));
  try {
    fn(datos);
  } finally {
    rmSync(datos, { recursive: true, force: true });
  }
}

function datos(n: number): DatosAtestacion {
  return {
    ticket: `TK-20261012-00${n}A`,
    codigoGeneracion: `5A1C0E7B-3D4F-4A8E-9B2C-7F6E5D4C3B${n.toString(16).padStart(2, "0").toUpperCase()}`,
    numeroControl: `DTE-01-M001P001-00000000000000${n}`,
    tipoDte: "01",
    generacion: "caso",
    momentoPago: "2026-10-12T18:41:07.312Z",
    sats: 12236 + n,
    usdCentavos: 452,
    tasaUsdPorBtc: "36940.18",
    tasaFuente: "Blink receive.lightning: settlementDisplayAmount / settlementAmount",
    paymentHash: `bf6b61f814b2e2284f5cbb7c9f9e67887018ffe3f53bedb9b70dec0a15e${n.toString(16).padStart(4, "0")}`,
    codigoFormaPago: "99",
    referencia: "BTC-LN|12236sat|36940.18|bf6b61f814b2",
    registrada: "2026-10-12T18:50:00.000Z",
  };
}

function escribir(dir: string, lineas: string[]) {
  writeFileSync(rutaAtestaciones(dir), `${lineas.join("\n")}\n`, "utf8");
}

function lineas(dir: string): string[] {
  return readFileSync(rutaAtestaciones(dir), "utf8").split("\n").filter((l) => l.length > 0);
}

test("canonical form does not depend on key order and writes integers without a fraction", () => {
  const a = { b: 2, a: { z: 1, y: [3, 1.5, null, true] }, c: "x" };
  const b = { c: "x", a: { y: [3, 1.5, null, true], z: 1 }, b: 2.0 };
  assert.equal(canonico(a), canonico(b));
  assert.equal(canonico(a), '{"a":{"y":[3,1.5,null,true],"z":1},"b":2,"c":"x"}');
  assert.equal(canonico({ k: undefined, n: 1 }), '{"n":1}');
  assert.throws(() => canonico(Number.NaN), /no finito/);
});

test("a chain of records verifies, and the head is the last hash", () => {
  conDatos((dir) => {
    for (let i = 1; i <= 3; i++) registrarAtestacion(dir, datos(i));
    const v = verificarCadena(dir);
    assert.equal(v.ok, true, JSON.stringify(v));
    assert.equal(v.registros, 3);
    const e = exportarCabeza(dir);
    assert.equal(e.cabeza, v.cabeza);
    assert.equal(e.registros, 3);
  });
});

test("the first record links to 64 zeros", () => {
  conDatos((dir) => {
    const { registro } = registrarAtestacion(dir, datos(1));
    assert.equal(registro.anterior, HASH_INICIAL);
    assert.equal(HASH_INICIAL.length, 64);
  });
});

test("editing one field in the middle breaks verification at that record", () => {
  conDatos((dir) => {
    for (let i = 1; i <= 3; i++) registrarAtestacion(dir, datos(i));
    const l = lineas(dir);
    l[1] = (l[1] as string).replace('"usdCentavos":452', '"usdCentavos":453');
    escribir(dir, l);
    const v = verificarCadena(dir);
    assert.equal(v.ok, false);
    assert.equal(v.primerRoto?.linea, 2);
    assert.match(v.primerRoto?.motivo ?? "", /alterado/);
  });
});

test("deleting a line in the middle breaks verification at the record after the gap", () => {
  conDatos((dir) => {
    for (let i = 1; i <= 3; i++) registrarAtestacion(dir, datos(i));
    const l = lineas(dir);
    l.splice(1, 1);
    escribir(dir, l);
    const v = verificarCadena(dir);
    assert.equal(v.ok, false);
    assert.equal(v.primerRoto?.linea, 2);
    assert.match(v.primerRoto?.motivo ?? "", /anterior/);
  });
});

test("reordering two lines breaks verification", () => {
  conDatos((dir) => {
    for (let i = 1; i <= 3; i++) registrarAtestacion(dir, datos(i));
    const l = lineas(dir);
    [l[1], l[2]] = [l[2] as string, l[1] as string];
    escribir(dir, l);
    const v = verificarCadena(dir);
    assert.equal(v.ok, false);
    assert.equal(v.primerRoto?.linea, 2);
  });
});

test("building the same document twice writes one record", () => {
  conDatos((dir) => {
    const primera = registrarAtestacion(dir, datos(1));
    const segunda = registrarAtestacion(dir, datos(1));
    assert.equal(primera.nueva, true);
    assert.equal(segunda.nueva, false);
    assert.equal(lineas(dir).length, 1);
    assert.equal(segunda.registro.hash, primera.registro.hash);
  });
});

test("a different codigoGeneracion for the same ticket is a new record", () => {
  conDatos((dir) => {
    registrarAtestacion(dir, datos(1));
    const otro = { ...datos(1), codigoGeneracion: "11111111-2222-4333-8444-555555555555" };
    assert.equal(registrarAtestacion(dir, otro).nueva, true);
    assert.equal(lineas(dir).length, 2);
    assert.equal(verificarCadena(dir).ok, true);
  });
});

test("a removed last line is invisible to the chain and visible against an exported head", () => {
  conDatos((dir) => {
    for (let i = 1; i <= 2; i++) registrarAtestacion(dir, datos(i));
    const cabeza = exportarCabeza(dir).cabeza;
    const l = lineas(dir);
    l.pop();
    escribir(dir, l);
    assert.equal(verificarCadena(dir).ok, true, "the chain alone cannot see a removed last line");
    assert.notEqual(exportarCabeza(dir).cabeza, cabeza, "the exported head shows it");
  });
});

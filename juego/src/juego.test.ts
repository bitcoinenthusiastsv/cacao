import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AlmacenJuego } from "./almacen.ts";
import { idLogro } from "./economia.ts";
import { PREGUNTAS } from "./quiz.ts";

function tiendaTemporal(): { almacen: AlmacenJuego; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "cacao-juego-"));
  return { almacen: new AlmacenJuego(dir), dir };
}

test("no paga dos veces el mismo logro", () => {
  const { almacen, dir } = tiendaTemporal();
  try {
    const { sesion } = almacen.iniciarJugador("Chele");
    const correcta = PREGUNTAS[0]!.correcta;
    const r1 = almacen.responder(sesion.token, 0, correcta);
    assert.equal(r1.ok, true);
    assert.ok((r1.satsOtorgados ?? 0) > 0);
    const r2 = almacen.responder(sesion.token, 0, correcta);
    assert.equal(r2.ok, false);
    assert.equal(r2.codigo, "orden_incorrecto");
    const snap = almacen.snapshot();
    const logro = idLogro(sesion.id, 0);
    assert.equal(snap.logrosCobrados.filter((x) => x === logro).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("suma sats solo en respuestas correctas", () => {
  const { almacen, dir } = tiendaTemporal();
  try {
    const { sesion } = almacen.iniciarJugador("Maza");
    const mala = PREGUNTAS[0]!.correcta === 0 ? 1 : 0;
    const r1 = almacen.responder(sesion.token, 0, mala);
    assert.equal(r1.ok, true);
    assert.equal(r1.satsOtorgados, 0);
    assert.equal(r1.saldo, 0);
    const r2 = almacen.responder(sesion.token, 1, PREGUNTAS[1]!.correcta);
    assert.equal(r2.ok, true);
    assert.ok((r2.satsOtorgados ?? 0) > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rechaza intento de fijar saldo desde el almacén público", () => {
  const { almacen, dir } = tiendaTemporal();
  try {
    const r = almacen.intentoFijarSaldo();
    assert.equal(r.ok, false);
    assert.equal(r.codigo, "saldo_servidor");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("la tabla ordena por saldo descendente", () => {
  const { almacen, dir } = tiendaTemporal();
  try {
    const a = almacen.iniciarJugador("Ana");
    almacen.responder(a.sesion.token, 0, PREGUNTAS[0]!.correcta);
    const b = almacen.iniciarJugador("Beto");
    for (let i = 0; i < 3; i++) {
      almacen.responder(b.sesion.token, i, PREGUNTAS[i]!.correcta);
    }
    const tabla = almacen.tablaPosiciones();
    assert.ok(tabla.length >= 2);
    assert.ok(tabla[0]!.saldo >= tabla[1]!.saldo);
    assert.equal(tabla[0]!.nombre, "Beto");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

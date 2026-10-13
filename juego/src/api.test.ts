import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AlmacenJuego } from "./almacen.ts";
import { crearServidor } from "./servidor.ts";

test("la API rechaza un cuerpo con saldo enviado por el cliente", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cacao-juego-api-"));
  const almacen = new AlmacenJuego(dir);
  const servidor = crearServidor(almacen);
  await new Promise<void>((resolve) => servidor.listen(0, resolve));
  const addr = servidor.address();
  const puerto = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${puerto}/api/sesion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Tito", saldo: 99999 }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { codigo: string };
    assert.equal(data.codigo, "saldo_servidor");
  } finally {
    await new Promise<void>((resolve, reject) =>
      servidor.close((err) => (err ? reject(err) : resolve())),
    );
    rmSync(dir, { recursive: true, force: true });
  }
});

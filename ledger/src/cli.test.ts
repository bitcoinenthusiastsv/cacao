import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { raizLedger } from "./datos.ts";

const CLI = join(raizLedger(), "src", "cli.ts");

function ledger(datos: string, args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args, "--datos", datos], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function conDatos(fn: (datos: string) => void): void {
  const datos = mkdtempSync(join(tmpdir(), "ledger-cli-"));
  try {
    fn(datos);
  } finally {
    rmSync(datos, { recursive: true, force: true });
  }
}

function fixture(nombre: string): string {
  return join(raizLedger(), "fixtures", nombre);
}

test("a Lightning sale goes from ticket to a validated 01 with code 99, and the forced 11 fails with exit 1", () => {
  conDatos((datos) => {
    const nuevo = ledger(datos, ["ticket", "nuevo", "--desde", fixture("ticket-consumidor.json")]);
    assert.equal(nuevo.code, 0, nuevo.err);
    const id = /TK-\d{8}-[0-9A-F]{4}/.exec(nuevo.out)?.[0];
    assert.ok(id, "the ticket id is printed");

    const pago = ledger(datos, ["pagar", id, "--blink", fixture("blink-receive-lightning.json")]);
    assert.equal(pago.code, 0, pago.err);
    assert.match(pago.out, /\$4\.52 \(12,236 sats\) por Lightning/);

    const forzado = ledger(datos, ["dte", "construir", id, "--forzar-codigo", "11"]);
    assert.equal(forzado.code, 1);
    assert.match(forzado.out, /Generación de esquemas: caso/);
    assert.match(forzado.out, /Esquema \(espejo-herson\/DTE-FE-v1\.json\): 1 fallo/);
    assert.match(forzado.out, /resumen\.pagos\[0\]\.codigo: Bitcoin \(11\)/);
    assert.match(forzado.err, /error: El documento 01 no pasó la validación/);

    const normal = ledger(datos, ["dte", "construir", id]);
    assert.equal(normal.code, 0, normal.err);
    assert.match(normal.out, /Forma de pago: 99 · BTC-LN\|12236sat\|36940\.18\|bf6b61f814b2/);

    const validar = ledger(datos, ["dte", "validar", id]);
    assert.equal(validar.code, 0, validar.err);
    assert.match(validar.out, /RESULTADO: VÁLIDO/);
  });
});

test("the same Lightning payment cannot settle a second ticket", () => {
  conDatos((datos) => {
    const a = /TK-\d{8}-[0-9A-F]{4}/.exec(ledger(datos, ["ticket", "nuevo", "--desde", fixture("ticket-consumidor.json")]).out)?.[0];
    const b = /TK-\d{8}-[0-9A-F]{4}/.exec(ledger(datos, ["ticket", "nuevo", "--desde", fixture("ticket-consumidor.json")]).out)?.[0];
    assert.ok(a && b);
    assert.equal(ledger(datos, ["pagar", a, "--blink", fixture("blink-receive-lightning.json")]).code, 0);
    const otra = ledger(datos, ["pagar", b, "--blink", fixture("blink-receive-lightning.json")]);
    assert.equal(otra.code, 1);
    assert.match(otra.err, /ya cubre el ticket/);
  });
});

test("a business ticket paid by Lightning produces a 03 with code 11", () => {
  conDatos((datos) => {
    const id = /TK-\d{8}-[0-9A-F]{4}/.exec(ledger(datos, ["ticket", "nuevo", "--desde", fixture("ticket-contribuyente.json")]).out)?.[0];
    assert.ok(id);
    assert.equal(ledger(datos, ["pagar", id, "--blink", fixture("blink-receive-lightning-ccf.json")]).code, 0);
    const r = ledger(datos, ["dte", "construir", id, "--esquemas", "2026"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Documento 03 creado y validado/);
    assert.match(r.out, /Forma de pago: 11 ·/);
  });
});

test("production needs --confirmar-produccion, and the failure is one plain sentence", () => {
  conDatos((datos) => {
    const id = /TK-\d{8}-[0-9A-F]{4}/.exec(ledger(datos, ["ticket", "nuevo", "--desde", fixture("ticket-consumidor.json")]).out)?.[0];
    assert.ok(id);
    assert.equal(ledger(datos, ["pagar", id, "--efectivo"]).code, 0);
    const r = ledger(datos, ["dte", "construir", id, "--ambiente", "01"]);
    assert.equal(r.code, 1);
    assert.match(r.err, /requiere --confirmar-produccion/);
  });
});

test("bad orders and bad payment options exit non-zero with one clear sentence", () => {
  conDatos((datos) => {
    const desconocida = ledger(datos, ["factura", "mágica"]);
    assert.equal(desconocida.code, 1);
    assert.match(desconocida.err, /Orden desconocida/);
    const ambos = ledger(datos, ["pagar", "TK-20261013-AAAA", "--efectivo", "--blink", fixture("blink-receive-lightning.json")]);
    assert.equal(ambos.code, 1);
    assert.match(ambos.err, /no con ambos ni con ninguno/);
    const inexistente = ledger(datos, ["ticket", "ver", "TK-20261013-AAAA"]);
    assert.equal(inexistente.code, 1);
    assert.match(inexistente.err, /No existe el ticket/);
  });
});

test("dte validar on a file prints the two layers and exits 1 for an invalid document", () => {
  conDatos((datos) => {
    const r = ledger(datos, ["dte", "validar", fixture("ticket-consumidor.json")]);
    assert.equal(r.code, 1);
    assert.match(r.out, /Esquema: 0 fallo/);
    assert.match(r.out, /Regla adicional de CacaoLedger/);
    assert.match(r.err, /error: El documento no es válido/);
  });
});

test("--json prints machine-readable ticket data", () => {
  conDatos((datos) => {
    const id = /TK-\d{8}-[0-9A-F]{4}/.exec(ledger(datos, ["ticket", "nuevo", "--desde", fixture("ticket-consumidor.json")]).out)?.[0];
    assert.ok(id);
    const r = ledger(datos, ["ticket", "ver", id, "--json"]);
    assert.equal(r.code, 0);
    const t = JSON.parse(r.out) as { id: string; estado: string };
    assert.equal(t.id, id);
    assert.equal(t.estado, "abierto");
  });
});

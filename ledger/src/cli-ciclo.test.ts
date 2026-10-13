import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { raizLedger } from "./datos.ts";

const CLI = join(raizLedger(), "src", "cli.ts");

function ledger(datos: string, args: string[], extra: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args, "--datos", datos], {
    encoding: "utf8",
    cwd: raizLedger(),
    env: { ...process.env, LEDGER_AHORA: "2026-10-12T18:00:00Z", LEDGER_SEMILLA: "pruebas", ...extra },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function conDatos(fn: (datos: string) => void): void {
  const datos = mkdtempSync(join(tmpdir(), "ledger-ciclo-"));
  try {
    fn(datos);
  } finally {
    rmSync(datos, { recursive: true, force: true });
  }
}

function idDe(texto: string): string {
  const id = /TK-\d{8}-[0-9A-F]{4}/.exec(texto)?.[0];
  assert.ok(id, "ticket id printed");
  return id;
}

test("transmitting without --simulado explains that real transmission is not implemented", () => {
  conDatos((datos) => {
    const id = idDe(ledger(datos, ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor.json"]).out);
    ledger(datos, ["pagar", id, "--efectivo"]);
    ledger(datos, ["dte", "construir", id]);
    const r = ledger(datos, ["dte", "transmitir", id]);
    assert.equal(r.code, 1);
    assert.match(r.err, /transmisión real a Hacienda no está implementada/);
    assert.match(r.err, /--simulado/);
  });
});

test("a simulated transmission emits the ticket with a seal labelled as simulated; ticket ver prints it", () => {
  conDatos((datos) => {
    const id = idDe(ledger(datos, ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor.json"]).out);
    ledger(datos, ["pagar", id, "--efectivo"]);
    ledger(datos, ["dte", "construir", id]);
    const t = ledger(datos, ["dte", "transmitir", id, "--simulado"]);
    assert.equal(t.code, 0, t.err);
    assert.match(t.out, /Sello: sello simulado SIMULADO-[0-9A-F]{34}/);
    const ver = ledger(datos, ["ticket", "ver", id]);
    assert.match(ver.out, /Estado:  emitido/);
    assert.match(ver.out, /Sello: sello simulado SIMULADO-/);
    const otra = ledger(datos, ["dte", "transmitir", id, "--simulado"]);
    assert.equal(otra.code, 1, "an emitted ticket is not sent twice");
  });
});

test("a Lightning sale writes one attestation, and the chain verifies from the CLI", () => {
  conDatos((datos) => {
    const id = idDe(ledger(datos, ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor.json"]).out);
    ledger(datos, ["pagar", id, "--blink", "fixtures/blink-receive-lightning.json"]);
    assert.equal(ledger(datos, ["dte", "construir", id]).code, 0);
    const ver = ledger(datos, ["atestacion", "ver", id]);
    assert.match(ver.out, /Pago: \$4\.52 \(12,236 sats\)/);
    assert.match(ver.out, /Tasa: 36940\.18 USD\/BTC/);
    const v = ledger(datos, ["atestacion", "verificar"]);
    assert.equal(v.code, 0);
    assert.match(v.out, /Cadena íntegra: 1 registro\./);
    const e = ledger(datos, ["atestacion", "exportar"]);
    assert.match(e.out, /Cabeza de la cadena: [0-9a-f]{64}/);
  });
});

test("under 2026 a Lightning 01 is built with code 11 and prints the warning", () => {
  conDatos((datos) => {
    const id = idDe(ledger(datos, ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor.json"]).out);
    ledger(datos, ["pagar", id, "--blink", "fixtures/blink-receive-lightning.json"]);
    const r = ledger(datos, ["dte", "construir", id, "--esquemas", "2026"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Forma de pago: 11 ·/);
    assert.match(r.out, /AVISO: Código 11 \(Bitcoin\) en factura 01/);
    assert.match(r.out, /Generación de esquemas: 2026 \(ministerio-2026\/fe-f-v2\.json/);
  });
});

test("the daily close exits 1 when a sale has no document, and --json is valid JSON", () => {
  conDatos((datos) => {
    const id = idDe(ledger(datos, ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor.json"]).out);
    ledger(datos, ["pagar", id, "--efectivo"]);
    const cierre = ledger(datos, ["cierre", "2026-10-12"]);
    assert.equal(cierre.code, 1);
    assert.match(cierre.out, /No: 1 cobros sin documento válido\./);
    const json = ledger(datos, ["cierre", "2026-10-12", "--json"]);
    const parsed = JSON.parse(json.out) as { pendientes: number; respuesta: string };
    assert.equal(parsed.pendientes, 1);
  });
});

test("cierre --ayuda explains the 24-hour rule and why a daily close exists", () => {
  const r = spawnSync(process.execPath, [CLI, "cierre", "--ayuda"], { encoding: "utf8", cwd: raizLedger() });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /24 horas desde el rechazo/);
  assert.match(r.stdout, /control operativo/);
});

test("the demo runs under both generations, shows the chain break and exits 0", () => {
  for (const gen of ["caso", "2026"]) {
    const r = spawnSync(process.execPath, [CLI, "demo", "--esquemas", gen], { encoding: "utf8", cwd: raizLedger() });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Cadena rota en la línea 1/);
    assert.match(r.stdout, /No: 4 cobros sin documento válido\./);
    assert.match(r.stdout, /Fin de la demostración\./);
    assert.doesNotMatch(r.stdout, /ledger-demo-/, "the temporary folder name is scrubbed from the output");
  }
});

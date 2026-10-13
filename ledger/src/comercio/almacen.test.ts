import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { raizLedger } from "../datos.ts";
import { descifrarConClave } from "./cifrado.ts";
import {
  descifrarMaterialComercio,
  leerRegistroComercio,
  registrarComercio,
} from "./almacen.ts";

const PEM = readFileSync(join(raizLedger(), "fixtures/comercio-prueba/clave-privada.pem"), "utf8");
const MAESTRA_A = Buffer.from("a".repeat(32));
const MAESTRA_B = Buffer.from("b".repeat(32));

function conDatos(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "ledger-comercio-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("each merchant gets its own envelope; another merchant's blob cannot be opened with the wrong DEK", () => {
  conDatos((dir) => {
    registrarComercio(dir, "cafeteria", "06141901010013", { passwordPri: "clave-cafe-01", clavePrivadaPem: PEM }, MAESTRA_A);
    registrarComercio(dir, "pupuseria", "06141901010014", { passwordPri: "clave-pupu-99", clavePrivadaPem: PEM }, MAESTRA_A);
    const cafe = descifrarMaterialComercio(dir, "cafeteria", MAESTRA_A);
    const pupu = descifrarMaterialComercio(dir, "pupuseria", MAESTRA_A);
    assert.equal(cafe.passwordPri, "clave-cafe-01");
    assert.equal(pupu.passwordPri, "clave-pupu-99");
    const regCafe = leerRegistroComercio(dir, "cafeteria");
    const regPupu = leerRegistroComercio(dir, "pupuseria");
    const dekCafe = descifrarConClave(MAESTRA_A, regCafe.sobreDek);
    assert.throws(() => descifrarConClave(dekCafe, regPupu.material));
  });
});

test("wrong master key refuses decryption for that merchant", () => {
  conDatos((dir) => {
    registrarComercio(dir, "uno", "06141901010013", { passwordPri: "password-123456", clavePrivadaPem: PEM }, MAESTRA_A);
    assert.throws(() => descifrarMaterialComercio(dir, "uno", MAESTRA_B), /No se pudo descifrar/);
  });
});

test("encrypted files on disk do not contain the private key or password in plain text", () => {
  conDatos((dir) => {
    const pwd = "secreto-local-prueba-01";
    registrarComercio(dir, "demo", "06141901010013", { passwordPri: pwd, clavePrivadaPem: PEM }, MAESTRA_A);
    const texto = readFileSync(join(dir, "comercios", "demo.json"), "utf8");
    assert.doesNotMatch(texto, new RegExp(pwd));
    assert.doesNotMatch(texto, /BEGIN PRIVATE KEY/);
  });
});

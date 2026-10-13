// npm run sitio: runs the demo into a temporary data folder and writes the static site from it,
// so one command produces a folder that can be published as it is.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { raizLedger } from "./datos.ts";
import { DIA_DEMO, MINUTO_CIERRE_DEMO, ejecutarDemo } from "./demo.ts";
import { generarSitio } from "./web/generar.ts";

const INICIO_DEMO = Date.parse("2026-10-12T18:00:00Z");

export function publicarSitio(salida: string): number {
  const tmp = mkdtempSync(join(tmpdir(), "ledger-sitio-"));
  const datos = join(tmp, "datos");
  try {
    // The demo is fixed to the caso generation, so the published site does not depend on the environment.
    const codigo = ejecutarDemo("caso", { datos, silenciosa: true });
    if (codigo !== 0) {
      process.stderr.write("error: la demostración no terminó como se esperaba; no se escribió el sitio.\n");
      return codigo;
    }
    const ahora = new Date(INICIO_DEMO + MINUTO_CIERRE_DEMO * 60_000);
    const archivos = generarSitio({ datos, salida, dia: DIA_DEMO, ahora });
    process.stdout.write(`Sitio escrito en ${salida} (${archivos.length} archivos).\n`);
    return 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

process.exitCode = publicarSitio(join(raizLedger(), "sitio"));

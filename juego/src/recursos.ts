import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// CSS and the quiz script are read from disk. Locally they sit next to the
// source. A published build keeps the same src/web path from the project root.
export function leerRecurso(nombre: string, modulo: string): string {
  const juntoAlModulo = fileURLToPath(new URL(`./web/${nombre}`, modulo));
  const enCarpetaWeb = fileURLToPath(new URL(`./${nombre}`, modulo));
  const candidatos = [
    juntoAlModulo,
    enCarpetaWeb,
    join(process.cwd(), "src", "web", nombre),
    join(process.cwd(), "juego", "src", "web", nombre),
  ];
  for (const ruta of candidatos) {
    if (existsSync(ruta)) return readFileSync(ruta, "utf8");
  }
  throw new Error(`No está el recurso ${nombre}`);
}

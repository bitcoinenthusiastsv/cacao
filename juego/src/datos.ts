import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

export function dirDatos(opcion?: string): string {
  const porDefecto = process.env.VERCEL ? "/tmp/cacao-juego" : join(RAIZ, "data");
  return resolve(opcion ?? process.env.CACAO_JUEGO_DATOS ?? porDefecto);
}

export function raizJuego(): string {
  return RAIZ;
}

export function escribirJson(ruta: string, valor: unknown): void {
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(valor, null, 2)}\n`, "utf8");
  renameSync(tmp, ruta);
}

export function leerJson(ruta: string): unknown {
  const texto = readFileSync(ruta, "utf8");
  return JSON.parse(texto) as unknown;
}

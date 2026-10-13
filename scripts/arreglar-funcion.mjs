// Runs after `astro build`. Workaround for @astrojs/vercel 11.0.13 with Astro 7.3:
// the server function's bundle keeps two side-effect-only imports from the adapter's build-time code
// (`import "rolldown"` and `import "@vercel/routing-utils"`). Nothing uses them at runtime, but
// rolldown needs a native binary that is not shipped with the function, so every request fails with
// "Cannot find native binding". Removing the two lines fixes it. Delete this script once the adapter
// no longer emits them (the build prints how many lines it removed).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const RAIZ = '.vercel/output/functions';
const SOBRAN = /^import ["'](?:rolldown|@vercel\/routing-utils)["'];\r?\n/gm;

async function* archivos(dir) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name === 'node_modules') continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) yield* archivos(ruta);
    else if (e.name.endsWith('.mjs')) yield ruta;
  }
}

let quitadas = 0;
for await (const ruta of archivos(RAIZ)) {
  const texto = await readFile(ruta, 'utf8');
  const limpio = texto.replace(SOBRAN, '');
  if (limpio !== texto) {
    quitadas += (texto.match(SOBRAN) ?? []).length;
    await writeFile(ruta, limpio);
  }
}
console.log(`arreglar-funcion: ${quitadas} imports de build quitados de la función del servidor`);

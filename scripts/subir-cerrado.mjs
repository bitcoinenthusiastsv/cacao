// Uploads the locked text of the paid stories to public.media_cerrado. Run it after scripts/cerrado.mjs,
// with the service-role key in the environment:
//   node --env-file=<your env file> scripts/subir-cerrado.mjs
// It prints only how many rows it wrote. It never prints the text or the keys.
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const ARCHIVO = 'src/data/cerrado.json';

let cerrado;
try {
  cerrado = JSON.parse(await readFile(ARCHIVO, 'utf8'));
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`No existe ${ARCHIVO}. Corré primero: node scripts/cerrado.mjs`);
    process.exit(1);
  }
  throw error;
}

const url = process.env.SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const ahora = new Date().toISOString();
const filas = Object.entries(cerrado).map(([slug, html]) => ({ slug, html, actualizado_en: ahora }));
if (filas.length === 0) {
  console.error(`${ARCHIVO} no tiene historias. Corré primero: node scripts/cerrado.mjs`);
  process.exit(1);
}

const cliente = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await cliente.from('media_cerrado').upsert(filas, { onConflict: 'slug' });
if (error) {
  console.error(`No se pudo subir media_cerrado: ${error.message}`);
  process.exit(1);
}
console.log(`media_cerrado: ${filas.length} filas subidas.`);

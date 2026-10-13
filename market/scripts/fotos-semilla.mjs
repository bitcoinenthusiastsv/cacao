// Gives the seeded products their photos. Crops every image in public/productos to 800x600
// (centred, JPEG, metadata stripped, under 120 KB), then sets productos.fotos on each seeded
// product that has no photo yet. Matched by exact name; never deletes or renames rows.
//
// Run from the market folder: node --env-file=.env.local scripts/fotos-semilla.mjs

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'productos');
const LIMITE_BYTES = 120 * 1024;

// [archivo sin extensión, nombre exacto del producto en scripts/sembrar.mjs]
const FOTOS = [
  ['tomate', 'Tomate criollo'],
  ['chile-verde', 'Chile verde'],
  ['guisquil', 'Güisquil'],
  ['pepino', 'Pepino'],
  ['mango-manila', 'Mango manila'],
  ['banano', 'Banano'],
  ['platano-maduro', 'Plátano maduro'],
  ['albahaca', 'Albahaca'],
  ['culantro', 'Culantro'],
  ['cafe-tostado-en-grano', 'Café tostado en grano'],
  ['cafe-molido', 'Café molido'],
  ['cacao-en-grano-tostado', 'Cacao en grano tostado'],
  ['maiz-blanco', 'Maíz blanco'],
  ['frijol-rojo', 'Frijol rojo'],
  ['queso-fresco', 'Queso fresco'],
  ['huevos-de-gallina-criolla', 'Huevos de gallina criolla'],
  ['crema-de-leche', 'Crema de leche'],
  ['miel-de-abeja', 'Miel de abeja'],
  ['mermelada-de-nance', 'Mermelada de nance'],
  ['hierbabuena', 'Hierbabuena'],
  ['te-de-flor-de-jamaica', 'Té de flor de jamaica'],
  ['conserva-de-chile-jalapeno', 'Conserva de chile jalapeño'],
  ['maracuya', 'Maracuyá'],
  ['limon-mandarina', 'Limón mandarina'],
];

// Crops to 4:3 and re-encodes. Lowers the quality only if the file is still too big.
async function procesar(archivo) {
  const original = await fs.readFile(archivo);
  const meta = await sharp(original).metadata();
  if (meta.format === 'jpeg' && meta.width === 800 && meta.height === 600) {
    return (await fs.stat(archivo)).size;
  }
  let salida;
  for (const calidad of [78, 72, 66]) {
    salida = await sharp(original)
      .rotate()
      .resize(800, 600, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: calidad, mozjpeg: true })
      .toBuffer();
    if (salida.length <= LIMITE_BYTES) break;
  }
  await fs.writeFile(archivo, salida);
  return salida.length;
}

async function procesarImagenes() {
  let total = 0;
  for (const [archivo] of FOTOS) {
    const bytes = await procesar(path.join(carpeta, `${archivo}.jpg`));
    total += bytes;
  }
  console.log(`Imágenes listas: ${FOTOS.length}, tamaño total ${(total / 1024).toFixed(0)} KB.`);
}

async function asignarFotos() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !claveServicio) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Usá --env-file=.env.local.');
    process.exit(1);
  }

  const s = createClient(url, claveServicio, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await s.from('productos').select('id, nombre, fotos');
  if (error) throw new Error(`Leyendo productos: ${error.message}`);

  let actualizados = 0;
  let yaTenian = 0;
  const sinCoincidencia = [];

  for (const [archivo, nombre] of FOTOS) {
    const filas = data.filter((p) => p.nombre === nombre);
    if (filas.length === 0) {
      sinCoincidencia.push(nombre);
      continue;
    }
    for (const fila of filas) {
      if (fila.fotos && fila.fotos.length > 0) {
        yaTenian++;
        continue;
      }
      const { error: errorUpdate } = await s
        .from('productos')
        .update({ fotos: [`/productos/${archivo}.jpg`] })
        .eq('id', fila.id);
      if (errorUpdate) throw new Error(`Actualizando ${nombre}: ${errorUpdate.message}`);
      actualizados++;
    }
  }

  console.log(`Filas actualizadas: ${actualizados}. Ya tenían foto: ${yaTenian}.`);
  console.log(
    sinCoincidencia.length
      ? `Sin coincidencia por nombre: ${sinCoincidencia.join(', ')}`
      : 'Todos los nombres coincidieron.',
  );
}

async function main() {
  await procesarImagenes();
  await asignarFotos();
}

main().catch((error) => {
  console.error('Fotos de la semilla fallaron:', error.message);
  process.exit(1);
});

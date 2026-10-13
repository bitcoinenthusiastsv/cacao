// Gives the seeded services their photos. Sets servicios.fotos on each seeded service whose
// photos are still empty, matched by exact title. Never overwrites a photo a person added,
// never deletes or renames rows. The photo files live in public/productos/servicio-*.jpg.
//
// Run from the market folder: node --env-file=.env.local scripts/fotos-servicios.mjs

import { createClient } from '@supabase/supabase-js';

// [título exacto en scripts/sembrar.mjs, archivo en public/productos]
// The service without a photo ("Instalación eléctrica en casa") is left out on purpose.
const FOTOS = [
  ['Asesoría para huerto casero', 'servicio-asesoria-huerto-casero.jpg'],
  ['Instalación de huerto en patio', 'servicio-instalacion-huerto-patio.jpg'],
  ['Tour del cafetal', 'servicio-tour-cafetal.jpg'],
  ['Taller de catación de café', 'servicio-taller-catacion-cafe.jpg'],
  ['Taller de queso fresco', 'servicio-taller-queso-fresco.jpg'],
  ['Reparación de cercas y portones', 'servicio-reparacion-cercas-portones.jpg'],
  ['Mandados en moto dentro de Suchitoto', 'servicio-mandados-moto-suchitoto.jpg'],
  ['Clases de guitarra', 'servicio-clases-guitarra.jpg'],
  ['Corte de pelo clásico', 'servicio-corte-pelo-clasico.jpg'],
  ['Arreglo de barba', 'servicio-arreglo-barba.jpg'],
  ['Reparación de celulares', 'servicio-reparacion-celulares.jpg'],
];

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

  const { data, error } = await s.from('servicios').select('id, titulo, fotos');
  if (error) throw new Error(`Leyendo servicios: ${error.message}`);

  let actualizados = 0;
  let yaTenian = 0;
  const sinCoincidencia = [];

  for (const [titulo, archivo] of FOTOS) {
    const filas = data.filter((x) => x.titulo === titulo);
    if (filas.length === 0) {
      sinCoincidencia.push(titulo);
      continue;
    }
    for (const fila of filas) {
      if (fila.fotos && fila.fotos.length > 0) {
        yaTenian++;
        continue;
      }
      const { error: errorUpdate } = await s
        .from('servicios')
        .update({ fotos: [`/productos/${archivo}`] })
        .eq('id', fila.id);
      if (errorUpdate) throw new Error(`Actualizando ${titulo}: ${errorUpdate.message}`);
      actualizados++;
    }
  }

  console.log(`Filas actualizadas: ${actualizados}. Ya tenían foto: ${yaTenian}.`);
  console.log(
    sinCoincidencia.length
      ? `Sin coincidencia por título: ${sinCoincidencia.join(', ')}`
      : 'Todos los títulos coincidieron.',
  );
}

asignarFotos().catch((error) => {
  console.error('Fotos de los servicios fallaron:', error.message);
  process.exit(1);
});

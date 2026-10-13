import type { Metadata } from 'next';
import { Suspense } from 'react';

import { cotizacionSegura } from '@/servidor/catalogo';
import { exigirSesion } from '@/servidor/sesion';
import { categoriasServicio } from '@/servidor/servicios';

import { FormularioNecesidad } from '../_componentes/FormularioNecesidad';
import estilos from '../estilos.module.css';

export const metadata: Metadata = { title: 'Publicar lo que necesito' };

export default function PaginaNuevaNecesidad() {
  return (
    <Suspense fallback={<p role="status">Cargando el formulario…</p>}>
      <Formulario />
    </Suspense>
  );
}

async function Formulario() {
  await exigirSesion('/necesito/nuevo');
  const [categorias, cotizacion] = await Promise.all([categoriasServicio(), cotizacionSegura()]);

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Publicar lo que necesito</h1>
      </section>
      <FormularioNecesidad categorias={categorias} cotizacion={cotizacion} />
    </>
  );
}

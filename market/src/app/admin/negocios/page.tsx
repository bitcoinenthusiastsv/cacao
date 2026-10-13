import type { Metadata } from 'next';

import { negociosAdmin } from '@/servidor/admin';
import { exigirAdmin } from '@/servidor/sesion';

import estilos from '../estilos.module.css';
import { ListaNegocios } from './ListaNegocios';

export const metadata: Metadata = {
  title: 'Negocios',
};

export default async function PaginaNegocios() {
  const sesion = await exigirAdmin();
  const negocios = await negociosAdmin(sesion.usuario.id);

  return (
    <>
      <section className={estilos.bloque} aria-labelledby="titulo-negocios">
        <h2 id="titulo-negocios" className={estilos.subtitulo}>
          Negocios
        </h2>
        <p className={estilos.descripcion}>
          Aprobá un negocio para que publique productos. Suspendilo si incumple una resolución.
        </p>
      </section>

      <ListaNegocios negocios={negocios} />
    </>
  );
}

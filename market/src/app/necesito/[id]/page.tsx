import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Boton } from '@/componentes/Boton';
import { cotizacionSegura } from '@/servidor/catalogo';
import { necesidadParaUsuario, necesidadPublica } from '@/servidor/necesidades';
import { sesionActual } from '@/servidor/sesion';

import { FichaNecesidad } from '../_componentes/FichaNecesidad';
import { VistaAutor } from '../_componentes/VistaAutor';
import { VistaVisitante } from '../_componentes/VistaVisitante';
import estilos from '../estilos.module.css';

// The need's title names the page. A need the visitor cannot read gets the plain title. Signed-in
// people read through their own view, so the author still sees the title of an assigned need.
export async function generateMetadata(props: PageProps<'/necesito/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const sesion = await sesionActual();
  const necesidad = sesion
    ? (await necesidadParaUsuario(id, sesion.usuario))?.necesidad
    : await necesidadPublica(id);
  return { title: necesidad?.titulo ?? 'Necesidad' };
}

// Three views of one page, decided on the server: signed out, the author, and any other signed-in person.
// A need the visitor may not see is answered exactly like a missing one.
export default function PaginaNecesidad(props: PageProps<'/necesito/[id]'>) {
  return (
    <Suspense fallback={<p role="status">Cargando la necesidad…</p>}>
      <Detalle params={props.params} />
    </Suspense>
  );
}

async function Detalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await sesionActual();
  const cotizacion = await cotizacionSegura();

  if (!sesion) {
    const necesidad = await necesidadPublica(id);
    if (!necesidad) notFound();

    const entrar = `/entrar?volver=${encodeURIComponent(`/necesito/${id}`)}`;
    return (
      <>
        <FichaNecesidad necesidad={necesidad} cotizacion={cotizacion} />
        <section className={estilos.bloque}>
          <p>Entrá para ofertar o para ver las ofertas.</p>
          <div>
            <Boton href={entrar}>Entrar</Boton>
          </div>
        </section>
      </>
    );
  }

  const vista = await necesidadParaUsuario(id, sesion.usuario);
  if (!vista) notFound();

  return (
    <>
      <p>
        <Link href="/necesito" className={estilos.volver}>
          ← Volver al tablón
        </Link>
      </p>
      <FichaNecesidad necesidad={vista.necesidad} cotizacion={cotizacion} />
      {vista.esAutor ? (
        <VistaAutor vista={vista} cotizacion={cotizacion} />
      ) : (
        <VistaVisitante vista={vista} cotizacion={cotizacion} />
      )}
    </>
  );
}

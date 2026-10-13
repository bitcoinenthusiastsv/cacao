import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Estrellas } from '@/componentes/Estrellas';
import { FotoProducto } from '@/componentes/FotoProducto';
import { cotizacionSegura } from '@/servidor/catalogo';
import { sesionActual } from '@/servidor/sesion';
import { servicioPublico, type ServicioDetalle } from '@/servidor/servicios';

import { PrecioServicio } from '../PrecioServicio';

import { FormularioContratar } from './FormularioContratar';
import { FormularioCotizar } from './FormularioCotizar';
import estilos from './estilos.module.css';

// The id comes from the URL, so the service is read per request. The public part streams first;
// the session (the form or the edit link) is read behind its own Suspense boundary.
export default function PaginaServicio(props: PageProps<'/servicios/[id]'>) {
  return (
    <Suspense fallback={<p role="status">Cargando el servicio…</p>}>
      <DetalleServicio params={props.params} />
    </Suspense>
  );
}

export async function generateMetadata(props: PageProps<'/servicios/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const servicio = await servicioPublico(id);
  return { title: servicio ? servicio.titulo : 'Servicio no encontrado' };
}

async function DetalleServicio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [servicio, cotizacion] = await Promise.all([servicioPublico(id), cotizacionSegura()]);
  // Paused, hidden, not approved or unknown: all answered the same way.
  if (!servicio) notFound();

  return (
    <article className={estilos.servicio}>
      <figure className={estilos.figura}>
        <FotoProducto
          src={servicio.foto}
          nombre={servicio.titulo}
          categoriaId={servicio.categoriaId}
          prioridad
        />
      </figure>

      <div className={estilos.info}>
        <p>
          <Link href="/servicios" className={estilos.volver}>
            ← Volver a servicios
          </Link>
        </p>
        <h1>{servicio.titulo}</h1>

        <p className={estilos.oferta}>
          Ofrece <Link href={`/negocios/${servicio.negocioId}`}>{servicio.negocioNombre}</Link>
          {!servicio.abierto && (
            <>
              {' '}
              <span className="marca marca--cerrado">Cerrado por ahora</span>
            </>
          )}
        </p>
        {servicio.cantidadResenas > 0 && servicio.promedio !== null && (
          <Estrellas valor={servicio.promedio} cantidad={servicio.cantidadResenas} />
        )}

        <PrecioServicio servicio={servicio} cotizacion={cotizacion} tamano="grande" />
        {servicio.tipoPrecio === 'cotizar' && <p>Precio según el trabajo.</p>}

        <p>Zona: {servicio.zona}</p>
        {servicio.descripcion && <p className={estilos.descripcion}>{servicio.descripcion}</p>}

        <Suspense fallback={<p role="status">Cargando…</p>}>
          <AccionServicio servicio={servicio} />
        </Suspense>
      </div>
    </article>
  );
}

// Owners see the edit link instead of the form. Everyone else gets the form, or a closed notice.
async function AccionServicio({ servicio }: { servicio: ServicioDetalle }) {
  const sesion = await sesionActual();
  if (sesion?.negocio?.id === servicio.negocioId) {
    return (
      <p>
        <Link href={`/mi-negocio/servicios/${servicio.id}`}>Editar este servicio</Link>
      </p>
    );
  }

  if (!servicio.abierto) {
    return <p className="aviso">Este negocio no está recibiendo pedidos ahora.</p>;
  }

  if (servicio.tipoPrecio === 'fijo') {
    return <FormularioContratar servicioId={servicio.id} />;
  }
  return <FormularioCotizar servicioId={servicio.id} />;
}

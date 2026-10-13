import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { cotizacionSegura } from '@/servidor/catalogo';
import { categoriasServicio, miServicio } from '@/servidor/servicios';
import { exigirVendedor } from '@/servidor/sesion';

import { motivoSinPublicar } from '../_componentes/AvisoServicios';
import { FormularioServicio } from '../_componentes/FormularioServicio';
import estilos from '../estilos.module.css';

export const metadata: Metadata = { title: 'Editar servicio' };

export default function EditarServicio(props: PageProps<'/mi-negocio/servicios/[id]'>) {
  return (
    <Suspense fallback={<p role="status">Cargando el servicio…</p>}>
      <FormularioEditar params={props.params} />
    </Suspense>
  );
}

// Cents to the text the provider types: 300 -> "3.00".
function dolaresTexto(centavos: number): string {
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

async function FormularioEditar({ params }: { params: PageProps<'/mi-negocio/servicios/[id]'>['params'] }) {
  const { id } = await params;
  const sesion = await exigirVendedor(`/mi-negocio/servicios/${id}`);

  // Another shop's service, or an id that is not a UUID, reads as "not found".
  const [servicio, listaCategorias, cotizacion] = await Promise.all([
    miServicio(sesion.negocio.id, id),
    categoriasServicio(),
    cotizacionSegura(),
  ]);
  if (!servicio) notFound();

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Editar servicio</h1>
      </section>

      <FormularioServicio
        categorias={listaCategorias}
        cotizacion={cotizacion}
        motivo={motivoSinPublicar(sesion.negocio.estado)}
        inicial={{
          id: servicio.id,
          categoriaId: servicio.categoriaId,
          titulo: servicio.titulo,
          descripcion: servicio.descripcion,
          zona: servicio.zona,
          tipoPrecio: servicio.tipoPrecio,
          precio: servicio.precioUsdCentavos === null ? '' : dolaresTexto(servicio.precioUsdCentavos),
          unidad: servicio.unidad ?? '',
          activo: servicio.activo,
          fotos: servicio.fotos,
        }}
      />
    </>
  );
}

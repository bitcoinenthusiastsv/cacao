import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { cotizacionSegura } from '@/servidor/catalogo';
import { categorias, miProducto } from '@/servidor/productos';
import { exigirVendedor } from '@/servidor/sesion';

import { AvisoNegocio } from '../_componentes/AvisoNegocio';
import { FormularioProducto } from '../_componentes/FormularioProducto';
import estilos from '../estilos.module.css';

export const metadata: Metadata = { title: 'Editar producto' };

export default function EditarProducto(props: PageProps<'/mi-negocio/productos/[id]'>) {
  return (
    <Suspense fallback={<p role="status">Cargando el producto…</p>}>
      <FormularioEditar params={props.params} />
    </Suspense>
  );
}

// Cents to the text the seller types: 350 -> "3.50".
function dolaresTexto(centavos: number): string {
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

async function FormularioEditar({ params }: { params: PageProps<'/mi-negocio/productos/[id]'>['params'] }) {
  const { id } = await params;
  const sesion = await exigirVendedor(`/mi-negocio/productos/${id}`);

  // Another shop's product, or an id that is not a UUID, reads as "not found".
  const [producto, listaCategorias, cotizacion] = await Promise.all([
    miProducto(sesion.negocio.id, id),
    categorias(),
    cotizacionSegura(),
  ]);
  if (!producto) notFound();

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Editar producto</h1>
      </section>

      <AvisoNegocio estado={sesion.negocio.estado} />

      <FormularioProducto
        categorias={listaCategorias}
        cotizacion={cotizacion}
        inicial={{
          id: producto.id,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          unidad: producto.unidad,
          categoriaId: producto.categoriaId,
          precio: dolaresTexto(producto.precioUsdCentavos),
          stock: String(producto.stock),
          activo: producto.activo,
          fotos: producto.fotos,
        }}
      />
    </>
  );
}

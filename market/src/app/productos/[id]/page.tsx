import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { AgregarAlCarrito } from '@/componentes/AgregarAlCarrito';
import { EtiquetaPrecio } from '@/componentes/EtiquetaPrecio';
import { FotoProducto } from '@/componentes/FotoProducto';
import { usdCentavosASats } from '@/lib/dinero';
import { cotizacionSegura, productoPorId } from '@/servidor/catalogo';

// The id comes from the URL, so the product is read per request. The heading area streams in
// behind a Suspense boundary, and notFound() renders in place when the product does not exist.
export default function PaginaProducto(props: PageProps<'/productos/[id]'>) {
  return (
    <Suspense fallback={<p role="status">Cargando el producto…</p>}>
      <DetalleProducto params={props.params} />
    </Suspense>
  );
}

export async function generateMetadata(props: PageProps<'/productos/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const producto = await productoPorId(id);
  return { title: producto ? producto.nombre : 'Producto no encontrado' };
}

async function DetalleProducto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [producto, cotizacion] = await Promise.all([productoPorId(id), cotizacionSegura()]);
  if (!producto) notFound();

  const sats = cotizacion === null ? null : usdCentavosASats(producto.precioUsdCentavos, cotizacion);

  // The reason the button is off, written under it. Sold out wins over closed.
  const motivo =
    producto.stock === 0
      ? 'Este producto está agotado.'
      : !producto.abierto
        ? 'La tienda está cerrada por ahora. Volvé a pedir cuando abra.'
        : null;

  return (
    <article className="producto">
      <figure>
        <FotoProducto
          src={producto.foto}
          nombre={producto.nombre}
          categoriaId={producto.categoriaId}
          prioridad
        />
      </figure>

      <div className="producto__info">
        <p>
          <Link href="/">← Volver al catálogo</Link>
        </p>
        <h1>{producto.nombre}</h1>

        <p className="producto__tienda">
          Vende{' '}
          <Link href={`/negocios/${producto.negocioId}`}>{producto.negocioNombre}</Link>
          {!producto.abierto && (
            <>
              {' '}
              <span className="marca marca--cerrado">Cerrado</span>
            </>
          )}
        </p>

        <EtiquetaPrecio usdCentavos={producto.precioUsdCentavos} sats={sats} tamano="grande" />

        <p className="producto__unidad">por {producto.unidad}</p>
        <p className="producto__stock">
          {producto.stock > 0 ? `Quedan ${producto.stock}` : 'Agotado'}
        </p>

        {producto.descripcion && <p className="producto__descripcion">{producto.descripcion}</p>}

        <AgregarAlCarrito
          producto={{
            id: producto.id,
            negocioId: producto.negocioId,
            negocioNombre: producto.negocioNombre,
            nombre: producto.nombre,
            unidad: producto.unidad,
            precioUsdCentavos: producto.precioUsdCentavos,
            foto: producto.foto,
            stock: producto.stock,
          }}
          motivoNoDisponible={motivo}
        />
      </div>
    </article>
  );
}

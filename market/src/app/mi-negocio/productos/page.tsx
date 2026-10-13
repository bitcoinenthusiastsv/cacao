import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Boton } from '@/componentes/Boton';
import { EtiquetaPrecio } from '@/componentes/EtiquetaPrecio';
import { FotoProducto } from '@/componentes/FotoProducto';
import { Vacio } from '@/componentes/Vacio';
import { usdCentavosASats } from '@/lib/dinero';
import { cotizacionSegura } from '@/servidor/catalogo';
import { misProductos } from '@/servidor/productos';
import { exigirVendedor } from '@/servidor/sesion';

import { AvisoNegocio } from './_componentes/AvisoNegocio';
import { ControlesProducto } from './_componentes/ControlesProducto';
import estilos from './estilos.module.css';

export const metadata: Metadata = { title: 'Mis productos' };

// The shop's products are read per request (the session decides which shop). The heading is
// static and the list streams in behind Suspense.
export default function MisProductos(props: PageProps<'/mi-negocio/productos'>) {
  return (
    <Suspense fallback={<p role="status">Cargando tus productos…</p>}>
      <ListaProductos busqueda={props.searchParams} />
    </Suspense>
  );
}

// Active products first, then paused ones; the state mark says which is which.
function estadoDe(activo: boolean, stock: number): { etiqueta: string; clase: string } {
  if (!activo) return { etiqueta: 'Pausado', clase: 'marca--cerrado' };
  if (stock === 0) return { etiqueta: 'Agotado', clase: 'marca--agotado' };
  return { etiqueta: 'Activo', clase: 'marca--abierto' };
}

async function ListaProductos({ busqueda }: { busqueda: PageProps<'/mi-negocio/productos'>['searchParams'] }) {
  const sesion = await exigirVendedor('/mi-negocio/productos');
  const [params, productos, cotizacion] = await Promise.all([
    busqueda,
    misProductos(sesion.negocio.id),
    cotizacionSegura(),
  ]);
  const guardado = params.guardado === '1';

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Mis productos</h1>
        <div className={estilos.cabecera__acciones}>
          <Boton href="/mi-negocio/productos/nuevo">Agregar producto</Boton>
        </div>
      </section>

      <AvisoNegocio estado={sesion.negocio.estado} />

      {guardado && (
        <p className={`${estilos.noticia} aviso`} role="status">
          Guardamos el producto.
        </p>
      )}
      {productos.length > 0 && cotizacion === null && (
        <p className="aviso">No pudimos leer el precio de bitcoin ahora. Mostramos solo dólares.</p>
      )}

      {productos.length === 0 ? (
        <Vacio
          texto="Todavía no tenés productos. Agregá el primero para que los compradores lo vean."
          accion={{ href: '/mi-negocio/productos/nuevo', etiqueta: 'Agregar producto' }}
        />
      ) : (
        <ul className={estilos.lista}>
          {productos.map((p) => {
            const estado = estadoDe(p.activo, p.stock);
            return (
              <li key={p.id} className={estilos.fila}>
                <div className={estilos.filaCuerpo}>
                  <div className={estilos.miniatura}>
                    <FotoProducto src={p.fotos[0] ?? null} nombre={p.nombre} categoriaId={p.categoriaId} />
                  </div>
                  <div className={estilos.filaTexto}>
                    <h2 className={estilos.nombre}>
                      <Link href={`/mi-negocio/productos/${p.id}`}>{p.nombre}</Link>
                    </h2>
                    <p className={estilos.meta}>
                      {p.categoriaNombre} · por {p.unidad}
                    </p>
                    <EtiquetaPrecio
                      usdCentavos={p.precioUsdCentavos}
                      sats={cotizacion === null ? null : usdCentavosASats(p.precioUsdCentavos, cotizacion)}
                    />
                    <p>
                      <span className={`marca ${estado.clase}`}>{estado.etiqueta}</span>
                    </p>
                  </div>
                </div>

                <ControlesProducto id={p.id} nombre={p.nombre} stock={p.stock} activo={p.activo} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

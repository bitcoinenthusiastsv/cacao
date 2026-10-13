import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Boton } from '@/componentes/Boton';
import { Vacio } from '@/componentes/Vacio';
import { formatoSats, usdCentavosASats } from '@/lib/dinero';
import { textoPrecio } from '@/lib/servicios';
import { cotizacionSegura } from '@/servidor/catalogo';
import { misServicios } from '@/servidor/servicios';
import { exigirVendedor } from '@/servidor/sesion';

import { AvisoServicios, motivoSinPublicar } from './_componentes/AvisoServicios';
import { ControlesServicio } from './_componentes/ControlesServicio';
import estilos from './estilos.module.css';

export const metadata: Metadata = { title: 'Mis servicios' };

// The shop's services are read per request (the session decides which shop). The heading is
// static and the list streams in behind Suspense.
export default function MisServicios(props: PageProps<'/mi-negocio/servicios'>) {
  return (
    <Suspense fallback={<p role="status">Cargando tus servicios…</p>}>
      <ListaServicios busqueda={props.searchParams} />
    </Suspense>
  );
}

async function ListaServicios({ busqueda }: { busqueda: PageProps<'/mi-negocio/servicios'>['searchParams'] }) {
  const sesion = await exigirVendedor('/mi-negocio/servicios');
  const [params, servicios, cotizacion] = await Promise.all([
    busqueda,
    misServicios(sesion.negocio.id),
    cotizacionSegura(),
  ]);
  const guardado = params.guardado === '1';
  const motivo = motivoSinPublicar(sesion.negocio.estado);

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Mis servicios</h1>
        <div>
          {motivo === null ? (
            <Boton href="/mi-negocio/servicios/nuevo">Agregar servicio</Boton>
          ) : (
            <>
              <Boton disabled aria-describedby="agregar-motivo">
                Agregar servicio
              </Boton>
              <p id="agregar-motivo" className={estilos.ayuda}>
                {sesion.negocio.estado === 'suspendido'
                  ? 'Se habilita cuando se levante la suspensión.'
                  : 'Se habilita cuando el negocio esté aprobado.'}
              </p>
            </>
          )}
        </div>
      </section>

      <AvisoServicios motivo={motivo} id="aviso-servicios" />

      {guardado && (
        <p className={`${estilos.noticia} aviso`} role="status">
          Guardamos el servicio.
        </p>
      )}

      {servicios.length === 0 ? (
        <Vacio
          texto="Todavía no tenés servicios. Agregá el primero para que los compradores lo vean."
          accion={motivo === null ? { href: '/mi-negocio/servicios/nuevo', etiqueta: 'Agregar servicio' } : undefined}
        />
      ) : (
        <ul className={estilos.lista}>
          {servicios.map((s) => (
            <li key={s.id} className={estilos.fila}>
              <div className={estilos.filaTexto}>
                <h2 className={estilos.nombre}>
                  <Link href={`/mi-negocio/servicios/${s.id}`}>{s.titulo}</Link>
                </h2>
                <p className={estilos.meta}>
                  {s.categoriaNombre} · {s.zona || 'Sin zona'}
                </p>
                <p className={estilos.precioLista}>{textoPrecio(s)}</p>
                {s.tipoPrecio === 'fijo' && s.precioUsdCentavos !== null && cotizacion !== null && (
                  <p className={estilos.meta}>
                    Equivale a {formatoSats(usdCentavosASats(s.precioUsdCentavos, cotizacion))} con la cotización de
                    hoy.
                  </p>
                )}
                <div className={estilos.marcas}>
                  <span className={`marca ${s.activo ? 'marca--abierto' : 'marca--cerrado'}`}>
                    {s.activo ? 'Activo' : 'Pausado'}
                  </span>
                  {s.oculto && <span className="marca marca--agotado">Oculto por CacaoMarket</span>}
                </div>
                {s.oculto && (
                  <p className={estilos.meta}>Un administrador lo ocultó. No se ve en el catálogo.</p>
                )}
              </div>

              <ControlesServicio
                id={s.id}
                titulo={s.titulo}
                activo={s.activo}
                puedeCambiar={motivo === null}
                motivoId={motivo === null ? null : 'aviso-servicios'}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

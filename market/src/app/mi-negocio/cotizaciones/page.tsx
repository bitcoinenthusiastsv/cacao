import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Boton } from '@/componentes/Boton';
import { EtiquetaPrecio } from '@/componentes/EtiquetaPrecio';
import { Vacio } from '@/componentes/Vacio';
import { fechaCorta } from '@/app/ordenes/fechas';
import { usdCentavosASats } from '@/lib/dinero';
import { ETIQUETA_COTIZACION } from '@/lib/servicios';
import { cotizacionSegura } from '@/servidor/catalogo';
import { cotizacionesDelNegocio, type Cotizacion } from '@/servidor/cotizaciones';
import { exigirVendedor } from '@/servidor/sesion';

import { FormularioRespuesta } from './_componentes/FormularioRespuesta';
import { RetirarCotizacion } from './_componentes/RetirarCotizacion';
import estilos from './estilos.module.css';

export const metadata: Metadata = { title: 'Cotizaciones' };

// The shop's quotes are read per request (the session decides which shop). The heading is static
// and the lists stream in behind Suspense.
export default function PaginaCotizaciones(props: PageProps<'/mi-negocio/cotizaciones'>) {
  return (
    <Suspense fallback={<p role="status">Cargando las cotizaciones…</p>}>
      <ListaCotizaciones busqueda={props.searchParams} />
    </Suspense>
  );
}

// Notices after an action: the actions redirect here, so the card that was answered can move.
function avisoDe(params: Record<string, string | string[] | undefined>): string | null {
  if (params.enviada === '1') return 'Enviamos tu cotización.';
  if (params.retirada === '1') return 'Listo, retiramos la cotización.';
  return null;
}

async function ListaCotizaciones({ busqueda }: { busqueda: PageProps<'/mi-negocio/cotizaciones'>['searchParams'] }) {
  const sesion = await exigirVendedor('/mi-negocio/cotizaciones');
  const [params, cotizaciones, cotizacion] = await Promise.all([
    busqueda,
    cotizacionesDelNegocio(sesion.negocio.id),
    cotizacionSegura(),
  ]);

  const aviso = avisoDe(params);
  const porResponder = cotizaciones.filter((c) => c.estado === 'solicitada');
  const ofertas = cotizaciones.filter((c) => c.estado !== 'solicitada');

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Cotizaciones</h1>
        <p>
          <Link href="/necesito" className={estilos.enlace}>
            Buscá trabajos en el tablón
          </Link>
        </p>
      </section>

      {aviso && (
        <p className={`${estilos.noticia} aviso`} role="status">
          {aviso}
        </p>
      )}
      {cotizaciones.length > 0 && cotizacion === null && (
        <p className="aviso">No pudimos leer el precio de bitcoin ahora. Mostramos solo dólares.</p>
      )}

      <section className={estilos.seccion} aria-labelledby="por-responder">
        <h2 id="por-responder">Por responder</h2>
        {porResponder.length === 0 ? (
          <Vacio texto="No tenés pedidos de cotización por responder." />
        ) : (
          <ul className={estilos.lista}>
            {porResponder.map((c) => (
              <li key={c.id} className={estilos.tarjeta}>
                <h3 className={estilos.titulo}>{c.titulo}</h3>
                <p className={estilos.meta}>
                  {c.clienteNombre || 'Alguien'} pidió una cotización · {fechaCorta(c.creadaEn)}
                </p>
                <p className={estilos.descripcion}>{c.descripcion}</p>
                <FormularioRespuesta cotizacionId={c.id} cotizacion={cotizacion} />
                <RetirarCotizacion cotizacionId={c.id} etiqueta="No puedo hacerlo" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={estilos.seccion} aria-labelledby="ofertas-hechas">
        <h2 id="ofertas-hechas">Ofertas que hice</h2>
        {ofertas.length === 0 ? (
          <Vacio
            texto="Todavía no respondiste cotizaciones ni hiciste ofertas."
            accion={{ href: '/necesito', etiqueta: 'Ver el tablón' }}
          />
        ) : (
          <ul className={estilos.lista}>
            {ofertas.map((c) => (
              <OfertaHecha key={c.id} cotizacion={c} tipoCambio={cotizacion} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function OfertaHecha({ cotizacion: c, tipoCambio }: { cotizacion: Cotizacion; tipoCambio: number | null }) {
  const etiquetaEstado = ETIQUETA_COTIZACION[c.estado];
  const titulo =
    c.origen === 'necesidad' && c.necesidadId ? (
      <Link href={`/necesito/${c.necesidadId}`}>{c.titulo}</Link>
    ) : (
      c.titulo
    );

  return (
    <li className={estilos.tarjeta}>
      <h3 className={estilos.titulo}>{titulo}</h3>
      <p className={estilos.meta}>
        <span className={`${estilos.estado} ${c.estado === 'aceptada' ? estilos.estadoAceptada : ''}`}>
          {etiquetaEstado}
        </span>{' '}
        · {fechaCorta(c.creadaEn)}
      </p>
      {c.precioUsdCentavos !== null && (
        <EtiquetaPrecio
          usdCentavos={c.precioUsdCentavos}
          sats={tipoCambio === null ? null : usdCentavosASats(c.precioUsdCentavos, tipoCambio)}
        />
      )}
      {c.mensaje && <p className={estilos.descripcion}>{c.mensaje}</p>}
      {c.estado === 'ofrecida' && <RetirarCotizacion cotizacionId={c.id} etiqueta="Retirar oferta" />}
      {c.estado === 'aceptada' && c.ordenId && (
        <Boton href={`/ordenes/${c.ordenId}`} variante="secundario">
          Ver el trabajo
        </Boton>
      )}
    </li>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Vacio } from '@/componentes/Vacio';
import { cotizacionSegura } from '@/servidor/catalogo';
import { misCotizacionesComoCliente } from '@/servidor/cotizaciones';
import { misNecesidades } from '@/servidor/necesidades';
import { exigirSesion } from '@/servidor/sesion';
import estilos from '@/app/necesito/estilos.module.css';
import { textoOfertas } from '@/app/necesito/_comun/formato';
import { ETIQUETA_NECESIDAD, type EstadoCotizacion } from '@/lib/servicios';

import { TarjetaCotizacion } from './_componentes/TarjetaCotizacion';

export const metadata: Metadata = { title: 'Mis cotizaciones y necesidades' };

export default function PaginaCotizaciones() {
  return (
    <Suspense fallback={<p role="status">Cargando tus cotizaciones…</p>}>
      <Contenido />
    </Suspense>
  );
}

// The quotes waiting for the user come first, then the ones still being answered.
const PRIMERO: Partial<Record<EstadoCotizacion, number>> = { ofrecida: 0, solicitada: 1 };

async function Contenido() {
  const sesion = await exigirSesion('/cotizaciones');
  const [necesidades, cotizaciones, usdBtc] = await Promise.all([
    misNecesidades(sesion.usuario.id),
    misCotizacionesComoCliente(sesion.usuario.id),
    cotizacionSegura(),
  ]);

  const ordenadas = [...cotizaciones].sort(
    (a, b) => (PRIMERO[a.estado] ?? 2) - (PRIMERO[b.estado] ?? 2),
  );

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Mis cotizaciones y necesidades</h1>
      </section>

      <section aria-labelledby="publique-titulo" className={estilos.seccion}>
        <h2 id="publique-titulo">Lo que publiqué</h2>
        {necesidades.length === 0 ? (
          <Vacio
            texto="Todavía no publicaste ninguna necesidad."
            accion={{ href: '/necesito/nuevo', etiqueta: 'Publicar lo que necesito' }}
          />
        ) : (
          <ul className={estilos.lista}>
            {necesidades.map((n) => (
              <li key={n.id}>
                <article className={estilos.tarjeta}>
                  <h3 className={estilos.titulo}>
                    <Link href={`/necesito/${n.id}`}>{n.titulo}</Link>
                  </h3>
                  <p className={estilos.meta}>
                    <span>{ETIQUETA_NECESIDAD[n.estado]}</span>
                    <span>{textoOfertas(n.ofertasAbiertas)}</span>
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cotizaciones-titulo" className={estilos.seccion}>
        <h2 id="cotizaciones-titulo">Cotizaciones</h2>
        {ordenadas.length === 0 ? (
          <Vacio
            texto="Todavía no pediste ninguna cotización."
            accion={{ href: '/servicios', etiqueta: 'Ver servicios' }}
          />
        ) : (
          <ul className={estilos.lista}>
            {ordenadas.map((c) => (
              <li key={c.id}>
                <TarjetaCotizacion dato={c} usdBtc={usdBtc} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

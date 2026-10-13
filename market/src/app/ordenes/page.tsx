import Link from 'next/link';
import { Suspense } from 'react';

import { Vacio } from '@/componentes/Vacio';
import { contarNoLeidos, misAvisos } from '@/servidor/avisos';
import { misCompras } from '@/servidor/pedidos';
import { exigirSesion } from '@/servidor/sesion';

import { BotonMarcarLeidos } from './BotonMarcarLeidos';
import { fechaCorta } from './fechas';
import { leerPagina, paginar } from './paginado';
import { Paginacion } from './Paginacion';
import styles from './ordenes.module.css';
import { TarjetaOrden } from './TarjetaOrden';

export default function PaginaCompras(props: PageProps<'/ordenes'>) {
  return (
    <Suspense fallback={<p role="status">Cargando tus órdenes…</p>}>
      <Compras searchParams={props.searchParams} />
    </Suspense>
  );
}

// The buyer's orders. Orders that wait for the buyer come first; the rest follow, newest first.
// Thirty per page; the page number comes from the address and is checked.
async function Compras({ searchParams }: { searchParams: Promise<{ pagina?: string | string[] }> }) {
  const { pagina: valorPagina } = await searchParams;
  const sesion = await exigirSesion('/ordenes');
  const [ordenes, avisos, noLeidos] = await Promise.all([
    misCompras(sesion.usuario.id),
    misAvisos(sesion.usuario.id, 5),
    contarNoLeidos(sesion.usuario.id),
  ]);

  const atencion = ordenes.filter((o) => o.necesitaAccion);
  const demas = ordenes.filter((o) => !o.necesitaAccion);
  const pagina = paginar([...atencion, ...demas], leerPagina(valorPagina));
  const enPagina = pagina.items.filter((o) => o.necesitaAccion);
  const demasEnPagina = pagina.items.filter((o) => !o.necesitaAccion);

  return (
    <div className={styles.pagina}>
      <div className={styles.encabezado}>
        <h1>Mis órdenes</h1>
        <p>Seguí cada pedido, desde el pago hasta la entrega.</p>
        <p>
          <Link href="/cotizaciones" className={styles.enlaceSeccion}>
            Mis cotizaciones y necesidades
          </Link>
        </p>
      </div>

      {avisos.length > 0 && (
        <section aria-labelledby="avisos-titulo" className={styles.grupo}>
          <h2 id="avisos-titulo">Avisos</h2>
          <ul className={styles.avisos}>
            {avisos.map((aviso) => (
              <li key={aviso.id} className={styles.avisoItem}>
                <Link href={aviso.ruta}>{aviso.texto}</Link>
                <span className="dato">{fechaCorta(aviso.creadoEn)}</span>
              </li>
            ))}
          </ul>
          {noLeidos > avisos.length && (
            <p className="dato">y {noLeidos - avisos.length} más sin leer</p>
          )}
          <BotonMarcarLeidos />
        </section>
      )}

      {ordenes.length === 0 ? (
        <Vacio texto="Todavía no hiciste ninguna compra ni contrataste un trabajo." accion={{ href: '/', etiqueta: 'Ver productos' }} />
      ) : (
        <>
          {enPagina.length > 0 && (
            <section aria-labelledby="atencion-titulo" className={styles.grupo}>
              <h2 id="atencion-titulo">Necesitan tu atención</h2>
              <ul className={styles.lista}>
                {enPagina.map((orden) => (
                  <TarjetaOrden key={orden.id} orden={orden} rol="comprador" />
                ))}
              </ul>
            </section>
          )}

          {demasEnPagina.length > 0 && (
            <section aria-labelledby="demas-titulo" className={styles.grupo}>
              <h2 id="demas-titulo">{atencion.length > 0 ? 'Las demás órdenes' : 'Tus órdenes'}</h2>
              <ul className={styles.lista}>
                {demasEnPagina.map((orden) => (
                  <TarjetaOrden key={orden.id} orden={orden} rol="comprador" />
                ))}
              </ul>
            </section>
          )}

          <Paginacion ruta="/ordenes" pagina={pagina.pagina} paginas={pagina.paginas} />
        </>
      )}
    </div>
  );
}

import { Suspense } from 'react';

import { EtiquetaPrecio } from '@/componentes/EtiquetaPrecio';
import { Vacio } from '@/componentes/Vacio';
import { Paginacion } from '@/app/ordenes/Paginacion';
import { leerPagina, paginar } from '@/app/ordenes/paginado';
import { TarjetaOrden } from '@/app/ordenes/TarjetaOrden';
import styles from '@/app/ordenes/ordenes.module.css';
import type { ResumenOrden } from '@/app/ordenes/tipos';
import { cobradoHoy, ventasDe } from '@/servidor/pedidos';
import { exigirVendedor } from '@/servidor/sesion';
import type { EstadoOrden, TipoOrden } from '@/lib/estados';

export default function PaginaVentas(props: PageProps<'/mi-negocio/ordenes'>) {
  return (
    <Suspense fallback={<p role="status">Cargando tus ventas…</p>}>
      <Ventas searchParams={props.searchParams} />
    </Suspense>
  );
}

// Each group is one step the seller can take next. Orders in the history group need nothing.
// `tipo` keeps a group to one kind of order; without it a group takes both.
const GRUPOS: { id: string; titulo: string; tipo?: TipoOrden; estados: EstadoOrden[] }[] = [
  { id: 'trabajos-acordados', titulo: 'Trabajos acordados', tipo: 'servicio', estados: ['acordada'] },
  { id: 'trabajos-cobrar', titulo: 'Trabajos por cobrar', tipo: 'servicio', estados: ['hecha', 'esperando_pago'] },
  { id: 'por-preparar', titulo: 'Por preparar', tipo: 'productos', estados: ['pagada'] },
  { id: 'listas', titulo: 'Listas para entregar', tipo: 'productos', estados: ['lista'] },
  { id: 'esperando', titulo: 'Esperando pago', tipo: 'productos', estados: ['creada', 'esperando_pago'] },
  { id: 'disputa', titulo: 'En disputa', estados: ['disputada', 'resuelta'] },
  { id: 'historial', titulo: 'Historial', estados: ['entregada', 'cerrada', 'expirada', 'cancelada'] },
];

// Groups that wait for the seller are short and shown whole. Only the history grows without limit,
// so it is the one that is paged.
async function Ventas({ searchParams }: { searchParams: Promise<{ pagina?: string | string[] }> }) {
  const { pagina: valorPagina } = await searchParams;
  const sesion = await exigirVendedor('/mi-negocio/ordenes');
  const negocioId = sesion.negocio.id;
  const [ordenes, hoy] = await Promise.all([ventasDe(negocioId), cobradoHoy(negocioId)]);

  return (
    <div className={styles.pagina}>
      <div className={styles.encabezado}>
        <h1>Ventas</h1>
        <p>Preparás cada pedido, lo marcás como listo y pedís el código al entregarlo.</p>
      </div>

      <section aria-labelledby="hoy-titulo" className={styles.grupo}>
        <h2 id="hoy-titulo">Cobrado hoy</h2>
        <EtiquetaPrecio usdCentavos={hoy.usdCentavos} sats={hoy.sats} />
        <p className="dato">
          {hoy.cantidad === 1 ? '1 orden pagada hoy' : `${hoy.cantidad} órdenes pagadas hoy`}
        </p>
      </section>

      {ordenes.length === 0 ? (
        <Vacio
          texto="Todavía no tenés órdenes. Cuando un comprador haga un pedido, lo vas a ver acá."
          accion={{ href: '/mi-negocio/productos', etiqueta: 'Ver mis productos' }}
        />
      ) : (
        GRUPOS.map((grupo) => {
          const todas: ResumenOrden[] = ordenes.filter(
            (o) => grupo.estados.includes(o.estado) && (!grupo.tipo || o.tipo === grupo.tipo),
          );
          if (todas.length === 0) return null;
          const pagina = grupo.id === 'historial' ? paginar(todas, leerPagina(valorPagina)) : null;
          const de = pagina ? pagina.items : todas;
          return (
            <section key={grupo.id} aria-labelledby={`${grupo.id}-titulo`} className={styles.grupo}>
              <h2 id={`${grupo.id}-titulo`}>{grupo.titulo}</h2>
              <ul className={styles.lista}>
                {de.map((orden) => (
                  <TarjetaOrden key={orden.id} orden={orden} rol="vendedor" />
                ))}
              </ul>
              {pagina && <Paginacion ruta="/mi-negocio/ordenes" pagina={pagina.pagina} paginas={pagina.paginas} />}
            </section>
          );
        })
      )}
    </div>
  );
}

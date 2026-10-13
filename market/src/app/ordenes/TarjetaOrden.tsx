import Link from 'next/link';

import { EstadoOrden } from '@/componentes/EstadoOrden';
import { formatoSats, formatoUsd } from '@/lib/dinero';

import { fechaCorta } from './fechas';
import styles from './ordenes.module.css';
import type { ResumenOrden, RolOrden } from './tipos';

// One order in a list. The whole card is the link to the order, for both roles.
// A job says so in its tag and title; a product order keeps its own wording.
export function TarjetaOrden({ orden, rol }: { orden: ResumenOrden; rol: RolOrden }) {
  const trabajo = orden.tipo === 'servicio';
  const etiquetaTipo = trabajo ? 'Trabajo' : rol === 'comprador' ? 'Compra' : 'Venta';
  const etiquetaParte = trabajo
    ? rol === 'comprador'
      ? 'Quien trabaja'
      : 'Cliente'
    : rol === 'comprador'
      ? 'Tienda'
      : 'Comprador';
  const unidades = orden.productos === 1 ? '1 producto' : `${orden.productos} productos`;

  return (
    <li>
      <Link href={`/ordenes/${orden.id}`} className={styles.tarjeta}>
        <span className={styles.cabeza}>
          <span className={styles.titulo}>
            <span className={styles.tipo}>{etiquetaTipo}</span>
            <span className={styles.numero}>
              {trabajo ? `Trabajo ${orden.numero}` : `Orden ${orden.numero}`}
            </span>
          </span>
          <EstadoOrden estado={orden.estado} />
        </span>
        <span className={styles.linea}>
          {etiquetaParte}: {orden.otraParte}
        </span>
        <span className={`${styles.linea} ${styles.totales}`}>
          {formatoSats(orden.totalSats)} · {formatoUsd(orden.totalUsdCentavos)}
        </span>
        <span className={`${styles.linea} dato`}>
          {trabajo ? fechaCorta(orden.creadaEn) : `${fechaCorta(orden.creadaEn)} · ${unidades}`}
        </span>
      </Link>
    </li>
  );
}

import { EstadoOrden } from '@/componentes/EstadoOrden';
import { ETIQUETA_ESTADO, type EstadoOrden as Estado, pasosDe, type TipoOrden } from '@/lib/estados';

import { fechaCorta } from '../fechas';

import styles from './orden.module.css';

type Situacion = 'hecho' | 'actual' | 'pendiente' | 'omitido';

const TEXTO_SITUACION: Record<Situacion, string> = {
  hecho: 'Hecho',
  actual: 'Ahora',
  pendiente: 'Pendiente',
  // A step a cancelled job never reached.
  omitido: 'No llegó',
};

// States that leave the happy path. They are shown after the timeline, not inside it.
const FUERA_DEL_CAMINO: Estado[] = ['expirada', 'disputada', 'resuelta', 'cancelada'];

// A job's payment is the entregada step; for a job that step reads "Pagado".
function etiquetaDe(paso: Estado, tipo: TipoOrden): string {
  if (tipo === 'servicio' && paso === 'entregada') return 'Pagado';
  return ETIQUETA_ESTADO[paso];
}

/**
 * The happy path as an ordered list, with text for each step (not only colour).
 * `fechas` holds the timestamp of each state the order has reached.
 */
export function Cronologia({
  tipo,
  estado,
  fechas,
  motivo,
}: {
  tipo: TipoOrden;
  estado: Estado;
  fechas: Partial<Record<Estado, string | null>>;
  motivo: string | null;
}) {
  const pasos = pasosDe(tipo);
  const lateral = FUERA_DEL_CAMINO.includes(estado) ? estado : null;
  const indiceActual = estado === 'creada' ? 0 : pasos.indexOf(estado);

  function situacionDe(paso: Estado, indice: number): Situacion {
    if (lateral === 'cancelada') return fechas[paso] ? 'hecho' : 'omitido';
    if (lateral) {
      // Disputed and resolved orders were paid, so the payment step is done. Expired ones never were.
      // A job disputed before payment was never paid, so its payment step is not done.
      if (lateral === 'expirada') return fechas[paso] ? 'hecho' : 'pendiente';
      if (paso === 'esperando_pago') return tipo === 'productos' || fechas.entregada ? 'hecho' : 'pendiente';
      return fechas[paso] ? 'hecho' : 'pendiente';
    }
    if (estado === 'cerrada') return 'hecho';
    if (indice < indiceActual) return 'hecho';
    if (indice === indiceActual) return 'actual';
    return 'pendiente';
  }

  return (
    <section aria-labelledby="cronologia-titulo" className={styles.bloque}>
      <h2 id="cronologia-titulo">Cómo va</h2>
      <ol className={styles.cronologia}>
        {pasos.map((paso, indice) => {
          const situacion = situacionDe(paso, indice);
          const fecha = fechas[paso] ?? null;
          return (
            <li
              key={paso}
              className={`${styles.paso} ${styles[situacion]}`}
              aria-current={situacion === 'actual' ? 'step' : undefined}
            >
              <span className={styles.pasoSituacion}>{TEXTO_SITUACION[situacion]}</span>
              <span className={styles.pasoEtiqueta}>{etiquetaDe(paso, tipo)}</span>
              {fecha && (
                <time className={`dato ${styles.pasoFecha}`} dateTime={fecha}>
                  {fechaCorta(fecha)}
                </time>
              )}
            </li>
          );
        })}
        {lateral && (
          <li className={`${styles.paso} ${styles.lateral}`}>
            <span className={styles.pasoSituacion}>Fuera del camino normal</span>
            <EstadoOrden estado={lateral} />
            {fechas[lateral] && (
              <time className={`dato ${styles.pasoFecha}`} dateTime={fechas[lateral] ?? undefined}>
                {fechaCorta(fechas[lateral] ?? '')}
              </time>
            )}
            {lateral === 'cancelada' && motivo && <p className={styles.motivo}>Motivo: {motivo}</p>}
          </li>
        )}
      </ol>
    </section>
  );
}

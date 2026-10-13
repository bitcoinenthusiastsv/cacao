import { ETIQUETA_ESTADO, PASOS, indicePaso, type EstadoEnvio } from '@/lib/transferencias';
import type { PasoHistorial } from '@/servidor/transferencias';

import { fechaSv } from './textosEnvio';
import estilos from './LineaDeTiempo.module.css';

// The three steps of a transfer, with the time each one happened in El Salvador. A failed or
// cancelled transfer stops on the step it reached and says how it ended below.
export function LineaDeTiempo({ estado, historial }: { estado: EstadoEnvio; historial: PasoHistorial[] }) {
  const actual = indicePaso(estado);
  const terminadoSinExito = actual === -1;
  const ultimo = historial[historial.length - 1];

  return (
    <ol className={estilos.lista}>
      {PASOS.map((paso, i) => {
        const entrada = historial.find((h) => h.estado === paso.estado);
        const alcanzado = terminadoSinExito ? entrada !== undefined : actual >= i;
        const enCurso = estado === 'procesando' && i === 1;
        const situacion = enCurso ? 'En curso' : alcanzado ? 'Listo' : 'Pendiente';
        const clase = [estilos.paso, enCurso ? estilos.enCurso : alcanzado ? estilos.listo : estilos.pendiente].join(
          ' ',
        );
        return (
          <li key={paso.estado} className={clase}>
            <span className={estilos.marca} aria-hidden="true" />
            <div>
              <p className={estilos.titulo}>{paso.titulo}</p>
              <p className={estilos.detalle}>
                <span>{situacion}</span>
                {entrada && <span>{` · ${fechaSv(entrada.cuando)}`}</span>}
              </p>
            </div>
          </li>
        );
      })}

      {terminadoSinExito && ultimo && (
        <li className={`${estilos.paso} ${estilos.fin}`}>
          <span className={estilos.marca} aria-hidden="true" />
          <div>
            <p className={estilos.titulo}>{ETIQUETA_ESTADO[estado]}</p>
            <p className={estilos.detalle}>
              <span>{fechaSv(ultimo.cuando)}</span>
            </p>
          </div>
        </li>
      )}
    </ol>
  );
}

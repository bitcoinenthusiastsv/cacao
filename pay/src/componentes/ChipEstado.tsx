import { ETIQUETA_ESTADO, type EstadoEnvio } from '@/lib/transferencias';

import estilos from './ChipEstado.module.css';

// The state as a labelled chip. The words carry the meaning; the colour only repeats it.
export function ChipEstado({ estado }: { estado: EstadoEnvio }) {
  return <span className={`${estilos.chip} ${estilos[estado]}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

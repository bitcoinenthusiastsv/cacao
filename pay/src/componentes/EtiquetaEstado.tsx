import { ETIQUETA_ESTADO, type EstadoEnvio } from '@/lib/transferencias';

import estilos from './EtiquetaEstado.module.css';

// The state as text on a coloured chip. The words carry the meaning; the colour only helps.
export function EtiquetaEstado({ estado, grande = false }: { estado: EstadoEnvio; grande?: boolean }) {
  const clase = [estilos.chip, estilos[estado], grande ? estilos.grande : ''].filter(Boolean).join(' ');
  return <span className={clase}>{ETIQUETA_ESTADO[estado]}</span>;
}

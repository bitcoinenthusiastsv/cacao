import { formatoSats, formatoUsd } from '@/lib/dinero';

import { usdDeSats } from './etiquetas';
import estilos from './estilos.module.css';

// Sats and USD together. The USD side comes from today's quote, so it is marked "aprox.".
export function Monto({ sats, cotizacionUsdBtc }: { sats: number; cotizacionUsdBtc: number | null }) {
  return (
    <span className={estilos.monto}>
      <span className={estilos.cifraChica}>{formatoSats(sats)}</span>
      <span className={estilos.aproximado}>
        {cotizacionUsdBtc === null
          ? 'Sin precio de bitcoin ahora'
          : `aprox. ${formatoUsd(usdDeSats(sats, cotizacionUsdBtc))}`}
      </span>
    </span>
  );
}

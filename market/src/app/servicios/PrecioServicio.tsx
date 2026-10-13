import { EtiquetaPrecio } from '@/componentes/EtiquetaPrecio';
import { usdCentavosASats } from '@/lib/dinero';
import type { TipoPrecio } from '@/lib/servicios';

import estilos from './estilos.module.css';

type Precio = {
  tipoPrecio: TipoPrecio;
  precioUsdCentavos: number | null;
  unidad: string | null;
};

// The price block of a service, shared by the list and the service page. A fixed price shows USD
// and the sats at today's quote; without a quote it shows USD only. A quoted service has no price.
export function PrecioServicio({
  servicio,
  cotizacion,
  tamano = 'normal',
}: {
  servicio: Precio;
  cotizacion: number | null;
  tamano?: 'normal' | 'grande';
}) {
  if (servicio.tipoPrecio === 'cotizar' || servicio.precioUsdCentavos === null) {
    return (
      <p>
        <span className={estilos.cotizar}>A cotizar</span>
      </p>
    );
  }

  const sats =
    cotizacion === null ? null : usdCentavosASats(servicio.precioUsdCentavos, cotizacion);

  return (
    <div className={estilos.precio}>
      <EtiquetaPrecio usdCentavos={servicio.precioUsdCentavos} sats={sats} tamano={tamano} />
      {servicio.unidad && <p className={estilos.unidad}>{servicio.unidad}</p>}
    </div>
  );
}

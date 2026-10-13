// Display helpers for the board and the quotes page. Pure, so both server and client code can use them.
import { formatoSats, formatoUsd, usdCentavosASats } from '@/lib/dinero';

// Same zone and style as the order pages, whatever the phone's clock says.
const fecha = new Intl.DateTimeFormat('es-SV', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/El_Salvador',
});

/** "12 oct, 3:40 p. m." */
export function fechaCorta(iso: string): string {
  return fecha.format(new Date(iso));
}

/** "$25.00 (unos 40,000 sats)". USD alone while no BTC price is available. */
export function precioAprox(usdCentavos: number, cotizacion: number | null): string {
  if (cotizacion === null) return formatoUsd(usdCentavos);
  return `${formatoUsd(usdCentavos)} (unos ${formatoSats(usdCentavosASats(usdCentavos, cotizacion))})`;
}

export function textoDias(dias: number): string {
  if (dias <= 0) return 'Vence hoy';
  if (dias === 1) return 'Queda 1 día';
  return `Quedan ${dias} días`;
}

export function textoOfertas(cantidad: number): string {
  if (cantidad === 0) return 'Sin ofertas todavía';
  return cantidad === 1 ? '1 oferta' : `${cantidad} ofertas`;
}

// The author's first name only. Empty when the name is unknown.
export function textoPublicador(nombre: string): string {
  return `Publicó ${nombre || 'alguien'}`;
}

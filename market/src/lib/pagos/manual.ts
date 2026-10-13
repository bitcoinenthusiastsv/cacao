// Manual adapter: the seller's Lightning Address supplies an invoice for the exact amount.
// Without an invoice the buyer gets the address and amount, and the seller confirms by hand.

import { pedirFactura, verificarPago, type OpcionesRed } from '../lightning/direccion';
import type { Cobro, ProveedorDePago } from './proveedor';

export type OpcionesManual = OpcionesRed & { ahora?: () => number };

export function crearProveedorManual(lightningAddress: string, opciones: OpcionesManual = {}): ProveedorDePago {
  const ahora = opciones.ahora ?? (() => Date.now());

  return {
    async crearCobro({ sats, memo, expiraEnSeg }): Promise<Cobro> {
      const expiraEn = new Date(ahora() + expiraEnSeg * 1000);
      // pedirFactura never throws: a slow or broken address just means no invoice.
      const factura = await pedirFactura(lightningAddress, sats, memo, opciones);
      return {
        referencia: null,
        bolt11: factura?.bolt11 ?? null,
        destino: lightningAddress,
        verificarUrl: factura?.verificarUrl ?? null,
        expiraEn,
      };
    },

    async consultarCobro(cobro) {
      // Expiry wins over a late payment, so a payment after the deadline never marks the order paid.
      if (ahora() > new Date(cobro.expiraEn).getTime()) return 'expirado';
      if (cobro.verificarUrl && (await verificarPago(cobro.verificarUrl, opciones))) return 'pagado';
      return 'pendiente';
    },
  };
}

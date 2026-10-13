// Picks the payment adapter for a shop. Only manual and fake work in this step.

import { esDireccionLightning } from '../lightning/direccion';
import { crearProveedorFalso } from './falso';
import { crearProveedorManual } from './manual';
import type { ProveedorDePago } from './proveedor';

export type { Cobro, ProveedorDePago } from './proveedor';

export type NegocioPago = {
  tipoProveedorPago: 'manual' | 'falso' | 'nwc' | 'blink';
  lightningAddress: string | null;
};

export function proveedorPara(negocio: NegocioPago): ProveedorDePago {
  switch (negocio.tipoProveedorPago) {
    case 'manual': {
      const direccion = negocio.lightningAddress;
      if (!direccion || !esDireccionLightning(direccion)) {
        throw new Error('SIN_DIRECCION: Cargá una Lightning Address válida para cobrar.');
      }
      return crearProveedorManual(direccion);
    }
    case 'falso':
      return crearProveedorFalso();
    case 'nwc':
    case 'blink':
      throw new Error(
        `NO_DISPONIBLE: El cobro con ${negocio.tipoProveedorPago} llega en el siguiente paso.`,
      );
  }
}

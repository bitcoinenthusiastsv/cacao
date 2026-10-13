// Fake adapter for tests and local development. Payments are marked paid by hand.

import type { Cobro, ProveedorDePago } from './proveedor';

// referencia -> pagado. Module state, so tests reset it with olvidarFalsos().
const cobros = new Map<string, boolean>();

function nuevaReferencia(): string {
  const cripto = globalThis.crypto;
  if (cripto && typeof cripto.randomUUID === 'function') return cripto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
}

export function crearProveedorFalso(): ProveedorDePago {
  return {
    async crearCobro({ expiraEnSeg }): Promise<Cobro> {
      const referencia = nuevaReferencia();
      cobros.set(referencia, false);
      return {
        referencia,
        bolt11: 'lnbcfalso' + referencia,
        destino: null,
        verificarUrl: null,
        expiraEn: new Date(Date.now() + expiraEnSeg * 1000),
      };
    },

    async consultarCobro(cobro) {
      if (Date.now() > new Date(cobro.expiraEn).getTime()) return 'expirado';
      if (cobro.referencia !== null && cobros.get(cobro.referencia) === true) return 'pagado';
      return 'pendiente';
    },
  };
}

export function marcarPagadoFalso(referencia: string): void {
  cobros.set(referencia, true);
}

export function olvidarFalsos(): void {
  cobros.clear();
}

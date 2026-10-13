import { beforeEach, describe, expect, it } from 'vitest';
import { olvidarFalsos } from './falso';
import { proveedorPara } from './index';

beforeEach(() => {
  olvidarFalsos();
});

describe('proveedorPara', () => {
  it('manual needs a Lightning Address', () => {
    expect(() => proveedorPara({ tipoProveedorPago: 'manual', lightningAddress: null })).toThrow(/^SIN_DIRECCION:/);
    expect(() => proveedorPara({ tipoProveedorPago: 'manual', lightningAddress: '' })).toThrow(/^SIN_DIRECCION:/);
  });

  it('manual refuses an address that is not a Lightning Address', () => {
    expect(() => proveedorPara({ tipoProveedorPago: 'manual', lightningAddress: 'no-es-direccion' })).toThrow(
      /^SIN_DIRECCION:/,
    );
  });

  it('manual with an address returns an adapter with both operations', () => {
    const proveedor = proveedorPara({ tipoProveedorPago: 'manual', lightningAddress: 'ana@tienda.ejemplo.com' });
    expect(typeof proveedor.crearCobro).toBe('function');
    expect(typeof proveedor.consultarCobro).toBe('function');
  });

  it('falso returns the fake adapter, which makes invoices without any network', async () => {
    const proveedor = proveedorPara({ tipoProveedorPago: 'falso', lightningAddress: null });
    const cobro = await proveedor.crearCobro({ sats: 100, memo: 'prueba', expiraEnSeg: 600 });
    expect(cobro.bolt11?.startsWith('lnbcfalso')).toBe(true);
  });

  it.each(['nwc', 'blink'] as const)('%s is not available yet', (tipo) => {
    expect(() => proveedorPara({ tipoProveedorPago: tipo, lightningAddress: null })).toThrow(/^NO_DISPONIBLE:/);
  });
});

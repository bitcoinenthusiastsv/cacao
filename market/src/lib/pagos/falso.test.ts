import { beforeEach, describe, expect, it } from 'vitest';
import { crearProveedorFalso, marcarPagadoFalso, olvidarFalsos } from './falso';

beforeEach(() => {
  olvidarFalsos();
});

describe('crearProveedorFalso', () => {
  it('creates a request with a random reference and a fake invoice', async () => {
    const antes = Date.now();
    const cobro = await crearProveedorFalso().crearCobro({ sats: 1250, memo: 'Pedido', expiraEnSeg: 600 });

    expect(cobro.referencia).toEqual(expect.any(String));
    expect(cobro.bolt11).toBe('lnbcfalso' + cobro.referencia);
    expect(cobro.destino).toBeNull();
    expect(cobro.verificarUrl).toBeNull();
    const expiraEn = cobro.expiraEn.getTime();
    expect(expiraEn).toBeGreaterThanOrEqual(antes + 600_000);
    expect(expiraEn).toBeLessThanOrEqual(Date.now() + 600_000);
  });

  it('gives each request its own reference', async () => {
    const proveedor = crearProveedorFalso();
    const a = await proveedor.crearCobro({ sats: 1, memo: '', expiraEnSeg: 600 });
    const b = await proveedor.crearCobro({ sats: 1, memo: '', expiraEnSeg: 600 });
    expect(a.referencia).not.toBe(b.referencia);
  });

  it('is pendiente until it is marked paid', async () => {
    const proveedor = crearProveedorFalso();
    const cobro = await proveedor.crearCobro({ sats: 1, memo: '', expiraEnSeg: 600 });
    expect(await proveedor.consultarCobro(cobro)).toBe('pendiente');

    marcarPagadoFalso(cobro.referencia as string);
    expect(await proveedor.consultarCobro(cobro)).toBe('pagado');
  });

  it('is expirado past the deadline, even when marked paid', async () => {
    const proveedor = crearProveedorFalso();
    const cobro = await proveedor.crearCobro({ sats: 1, memo: '', expiraEnSeg: -1 });
    marcarPagadoFalso(cobro.referencia as string);
    expect(await proveedor.consultarCobro(cobro)).toBe('expirado');
  });

  it('is pendiente for a request without a reference that has not expired', async () => {
    const proveedor = crearProveedorFalso();
    const sinReferencia = { referencia: null, verificarUrl: null, expiraEn: new Date(Date.now() + 60_000) };
    expect(await proveedor.consultarCobro(sinReferencia)).toBe('pendiente');
  });

  it('forgets marks after olvidarFalsos', async () => {
    const proveedor = crearProveedorFalso();
    const cobro = await proveedor.crearCobro({ sats: 1, memo: '', expiraEnSeg: 600 });
    marcarPagadoFalso(cobro.referencia as string);
    olvidarFalsos();
    expect(await proveedor.consultarCobro(cobro)).toBe('pendiente');
  });

  it('marking an unknown reference is harmless and makes that reference pagado', async () => {
    const proveedor = crearProveedorFalso();
    marcarPagadoFalso('referencia-externa');
    const cobro = {
      referencia: 'referencia-externa',
      verificarUrl: null,
      expiraEn: new Date(Date.now() + 60_000),
    };
    expect(await proveedor.consultarCobro(cobro)).toBe('pagado');
  });
});

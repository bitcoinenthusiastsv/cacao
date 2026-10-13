import { describe, expect, it } from 'vitest';
import { crearProveedorManual } from './manual';

const T0 = Date.parse('2026-10-12T12:00:00Z');
const ahora = () => T0;

type Llamada = { url: string };

function fakeFetch(ruta: (url: URL) => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const fetchFalso = (async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    llamadas.push({ url });
    return ruta(new URL(url));
  }) as unknown as typeof fetch;
  return { fetch: fetchFalso, llamadas };
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
}

const resolver = async (host: string): Promise<string[]> => {
  if (host === 'tienda.ejemplo.com') return ['93.184.216.34'];
  if (host === 'privado.ejemplo.com') return ['10.0.0.5'];
  return [];
};

const META = {
  tag: 'payRequest',
  callback: 'https://tienda.ejemplo.com/cb',
  minSendable: 1000,
  maxSendable: 1_000_000_000,
  commentAllowed: 0,
  metadata: '[]',
};

const VERIFY = 'https://tienda.ejemplo.com/verify/abc';

function rutaConFactura(verify: string | undefined = VERIFY) {
  return (url: URL) => {
    if (url.pathname.startsWith('/.well-known/lnurlp/')) return json(META);
    return json(verify === undefined ? { pr: 'lnbc35u1pexample' } : { pr: 'lnbc35u1pexample', verify });
  };
}

const EXPIRA_SEG = 600;

describe('crearProveedorManual: crearCobro', () => {
  it('returns an invoice for the exact amount with the verify URL and a 600 s deadline', async () => {
    const red = fakeFetch(rutaConFactura());
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });

    const cobro = await proveedor.crearCobro({ sats: 3500, memo: 'Pedido 42', expiraEnSeg: EXPIRA_SEG });

    expect(cobro).toEqual({
      referencia: null,
      bolt11: 'lnbc35u1pexample',
      destino: 'ana@tienda.ejemplo.com',
      verificarUrl: VERIFY,
      expiraEn: new Date(T0 + EXPIRA_SEG * 1000),
    });
  });

  it('falls back to address plus amount when the address gives no invoice', async () => {
    const red = fakeFetch((url) =>
      url.pathname.startsWith('/.well-known/lnurlp/') ? json(META) : json({ error: 'caído' }, 500),
    );
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });

    const cobro = await proveedor.crearCobro({ sats: 3500, memo: 'Pedido 42', expiraEnSeg: EXPIRA_SEG });

    expect(cobro.bolt11).toBeNull();
    expect(cobro.verificarUrl).toBeNull();
    expect(cobro.destino).toBe('ana@tienda.ejemplo.com');
    expect(cobro.referencia).toBeNull();
  });

  it('does not reach private networks: a private address falls back without a callback call', async () => {
    const red = fakeFetch(rutaConFactura());
    const proveedor = crearProveedorManual('ana@privado.ejemplo.com', { fetch: red.fetch, resolver, ahora });

    const cobro = await proveedor.crearCobro({ sats: 3500, memo: '', expiraEnSeg: EXPIRA_SEG });

    expect(cobro.bolt11).toBeNull();
    expect(red.llamadas).toHaveLength(0);
  });
});

describe('crearProveedorManual: consultarCobro', () => {
  const cobroBase = { referencia: null, verificarUrl: VERIFY, expiraEn: new Date(T0 + EXPIRA_SEG * 1000) };

  it('is pagado when the verify URL says settled', async () => {
    const red = fakeFetch(() => json({ settled: true }));
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });
    expect(await proveedor.consultarCobro(cobroBase)).toBe('pagado');
  });

  it('is pendiente when the verify URL says not settled', async () => {
    const red = fakeFetch(() => json({ settled: false }));
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });
    expect(await proveedor.consultarCobro(cobroBase)).toBe('pendiente');
  });

  it('is pendiente when the verify check fails', async () => {
    const red = fakeFetch(() => json({ settled: true }, 500));
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });
    expect(await proveedor.consultarCobro(cobroBase)).toBe('pendiente');
  });

  it('is pendiente with no verify URL, and does not call the network', async () => {
    const red = fakeFetch(() => json({ settled: true }));
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });
    expect(await proveedor.consultarCobro({ ...cobroBase, verificarUrl: null })).toBe('pendiente');
    expect(red.llamadas).toHaveLength(0);
  });

  it('is expirado once the deadline has passed', async () => {
    const red = fakeFetch(() => json({ settled: true }));
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });
    const vencido = { ...cobroBase, expiraEn: new Date(T0 - 1000) };
    expect(await proveedor.consultarCobro(vencido)).toBe('expirado');
  });

  it('a payment that arrives after the deadline does not mark the order paid', async () => {
    const red = fakeFetch(() => json({ settled: true }));
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });
    const tarde = { ...cobroBase, expiraEn: new Date(T0 - 1) };
    expect(await proveedor.consultarCobro(tarde)).toBe('expirado');
    expect(red.llamadas).toHaveLength(0);
  });

  it('is still pendiente at the exact deadline', async () => {
    const red = fakeFetch(() => json({ settled: false }));
    const proveedor = crearProveedorManual('ana@tienda.ejemplo.com', { fetch: red.fetch, resolver, ahora });
    expect(await proveedor.consultarCobro({ ...cobroBase, expiraEn: new Date(T0) })).toBe('pendiente');
  });
});

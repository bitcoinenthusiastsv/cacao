import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cotizacionUsdBtc, olvidarCotizacion } from './fuente';

type Respuesta = { status: number; cuerpo: unknown } | 'colgada';

// Fake fetch that answers each source by host. No network.
function fakeFetch(coinbase: Respuesta, kraken: Respuesta) {
  const llamadas: string[] = [];
  const f = (async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    llamadas.push(url);
    const r = url.includes('coinbase') ? coinbase : kraken;
    if (r === 'colgada') return new Promise<Response>(() => {});
    return new Response(JSON.stringify(r.cuerpo), { status: r.status });
  }) as unknown as typeof fetch;
  return { fetch: f, llamadas };
}

const COINBASE_OK = { status: 200, cuerpo: { data: { amount: '100000.00', currency: 'USD' } } };
const KRAKEN_OK = { status: 200, cuerpo: { error: [], result: { XXBTZUSD: { c: ['100500.0', '0.5'] } } } };
const FALLA: Respuesta = { status: 500, cuerpo: {} };

// Each test passes an empty env so a real PRECIO_FIJO_USD_BTC cannot leak in.
const SIN_ENV = { env: {} };

beforeEach(() => {
  olvidarCotizacion();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cotizacionUsdBtc: fixed price', () => {
  it('returns PRECIO_FIJO_USD_BTC without asking any source', async () => {
    const red = fakeFetch(COINBASE_OK, KRAKEN_OK);
    const precio = await cotizacionUsdBtc({ fetch: red.fetch, env: { PRECIO_FIJO_USD_BTC: '95000.5' } });
    expect(precio).toBe(95000.5);
    expect(red.llamadas).toHaveLength(0);
  });

  it('ignores a fixed price that is not a positive number', async () => {
    for (const valor of ['0', '-5', 'abc', '']) {
      const red = fakeFetch(COINBASE_OK, KRAKEN_OK);
      const precio = await cotizacionUsdBtc({ fetch: red.fetch, env: { PRECIO_FIJO_USD_BTC: valor } });
      expect(precio).toBe(100250);
      olvidarCotizacion();
    }
  });
});

describe('cotizacionUsdBtc: the five outcomes', () => {
  it('both sources agree within 2%: returns the average rounded to cents', async () => {
    const red = fakeFetch(COINBASE_OK, KRAKEN_OK);
    const precio = await cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV });
    expect(precio).toBe(100250);
    expect(red.llamadas).toHaveLength(2);
  });

  it('average is rounded to cents', async () => {
    const red = fakeFetch(
      { status: 200, cuerpo: { data: { amount: '100000.00' } } },
      { status: 200, cuerpo: { error: [], result: { XXBTZUSD: { c: ['100001.00'] } } } },
    );
    expect(await cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV })).toBe(100000.5);
  });

  it('exactly 2% apart still counts as agreement', async () => {
    const red = fakeFetch(
      { status: 200, cuerpo: { data: { amount: '100000.00' } } },
      { status: 200, cuerpo: { error: [], result: { XXBTZUSD: { c: ['102000.00'] } } } },
    );
    expect(await cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV })).toBe(101000);
  });

  it('more than 2% apart: refuses with PRECIO_DISCREPANTE', async () => {
    const red = fakeFetch(
      { status: 200, cuerpo: { data: { amount: '100000.00' } } },
      { status: 200, cuerpo: { error: [], result: { XXBTZUSD: { c: ['103000.00'] } } } },
    );
    await expect(cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV })).rejects.toThrow(/^PRECIO_DISCREPANTE:/);
  });

  it('only one source answers: returns that price', async () => {
    const red = fakeFetch(FALLA, KRAKEN_OK);
    expect(await cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV })).toBe(100500);
  });

  it('only the other source answers: returns that price', async () => {
    const red = fakeFetch(COINBASE_OK, { status: 200, cuerpo: { error: ['EGeneral:Temporary lockout'], result: {} } });
    expect(await cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV })).toBe(100000);
  });

  it('neither source answers: throws SIN_PRECIO', async () => {
    const red = fakeFetch(FALLA, { status: 200, cuerpo: 'no es un precio' });
    await expect(cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV })).rejects.toThrow(/^SIN_PRECIO:/);
  });

  it('a source that never answers counts as failed after 4 seconds', async () => {
    vi.useFakeTimers();
    const red = fakeFetch('colgada', KRAKEN_OK);
    const pendiente = cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pendiente).toBe(100500);
  });
});

describe('cotizacionUsdBtc: cache', () => {
  it('reuses a good result for 60 seconds', async () => {
    let reloj = 1_000_000;
    const ahora = () => reloj;
    const red = fakeFetch(COINBASE_OK, KRAKEN_OK);

    await cotizacionUsdBtc({ fetch: red.fetch, ahora, ...SIN_ENV });
    reloj += 59_000;
    expect(await cotizacionUsdBtc({ fetch: red.fetch, ahora, ...SIN_ENV })).toBe(100250);
    expect(red.llamadas).toHaveLength(2);

    reloj += 2_000;
    await cotizacionUsdBtc({ fetch: red.fetch, ahora, ...SIN_ENV });
    expect(red.llamadas).toHaveLength(4);
  });

  it('olvidarCotizacion clears the cache', async () => {
    const red = fakeFetch(COINBASE_OK, KRAKEN_OK);
    await cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV });
    olvidarCotizacion();
    await cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV });
    expect(red.llamadas).toHaveLength(4);
  });

  it('does not cache a refused result', async () => {
    const discrepante = fakeFetch(
      { status: 200, cuerpo: { data: { amount: '100000.00' } } },
      { status: 200, cuerpo: { error: [], result: { XXBTZUSD: { c: ['110000.00'] } } } },
    );
    await expect(cotizacionUsdBtc({ fetch: discrepante.fetch, ...SIN_ENV })).rejects.toThrow('PRECIO_DISCREPANTE');
    await expect(cotizacionUsdBtc({ fetch: discrepante.fetch, ...SIN_ENV })).rejects.toThrow('PRECIO_DISCREPANTE');
    expect(discrepante.llamadas).toHaveLength(4);
  });

  it('does not serve a cached live price when the fixed price is set', async () => {
    const red = fakeFetch(COINBASE_OK, KRAKEN_OK);
    await cotizacionUsdBtc({ fetch: red.fetch, ...SIN_ENV });
    expect(await cotizacionUsdBtc({ fetch: red.fetch, env: { PRECIO_FIJO_USD_BTC: '90000' } })).toBe(90000);
  });
});

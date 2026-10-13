import { describe, expect, it } from 'vitest';
import { esDireccionLightning, fetchSeguro, pedirFactura, verificarPago, type OpcionesRed } from './direccion';

type Llamada = { url: string; init: RequestInit | undefined };

// Fake fetch that records calls and answers from a route function. No network.
function fakeFetch(ruta: (url: URL, init: RequestInit | undefined) => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const fetchFalso = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    llamadas.push({ url, init });
    return ruta(new URL(url), init);
  }) as unknown as typeof fetch;
  return { fetch: fetchFalso, llamadas };
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
}

// Host name -> addresses it resolves to. Unknown names resolve to nothing.
function resolverFalso(mapa: Record<string, string[]>): (host: string) => Promise<string[]> {
  return async (host) => mapa[host] ?? [];
}

const PUBLICO = {
  'ejemplo.com': ['93.184.216.34'],
  'tienda.ejemplo.com': ['93.184.216.34'],
  'privado.ejemplo.com': ['10.0.0.5'],
  'loopback.ejemplo.com': ['127.0.0.1'],
  'loopback6.ejemplo.com': ['::1'],
};

function opciones(ruta: Parameters<typeof fakeFetch>[0], extra: Partial<OpcionesRed> = {}) {
  const red = fakeFetch(ruta);
  const opts: OpcionesRed = { fetch: red.fetch, resolver: resolverFalso(PUBLICO), ...extra };
  return { opts, llamadas: red.llamadas };
}

describe('esDireccionLightning', () => {
  it.each([
    'ana@ejemplo.com',
    'ana.lopez+cacao@mi-finca.sv',
    'user_1@sub.dominio.com.sv',
  ])('accepts %s', (texto) => {
    expect(esDireccionLightning(texto)).toBe(true);
  });

  it.each([
    ['uppercase letters', 'ANA@ejemplo.com'],
    ['no at sign', 'anaejemplo.com'],
    ['empty user part', '@ejemplo.com'],
    ['no top level domain', 'ana@ejemplo'],
    ['one letter top level domain', 'ana@ejemplo.c'],
    ['IP literal domain', 'ana@192.168.0.1'],
    ['localhost', 'ana@localhost'],
    ['double dot', 'ana@ejemplo..com'],
    ['label starts with a hyphen', 'ana@-ejemplo.com'],
    ['underscore in the domain', 'ana@mi_finca.com'],
    ['leading space', ' ana@ejemplo.com'],
    ['two at signs', 'ana@x@ejemplo.com'],
  ])('rejects %s', (_nombre, texto) => {
    expect(esDireccionLightning(texto)).toBe(false);
  });
});

describe('fetchSeguro, success', () => {
  it('returns parsed JSON and asks for no redirects', async () => {
    const { opts, llamadas } = opciones(() => json({ a: 1 }));
    await expect(fetchSeguro('https://tienda.ejemplo.com/datos', opts)).resolves.toEqual({ a: 1 });
    expect(llamadas[0].url).toBe('https://tienda.ejemplo.com/datos');
    expect(llamadas[0].init?.redirect).toBe('manual');
  });
});

describe('fetchSeguro, refusals', () => {
  it('refuses http', async () => {
    const { opts, llamadas } = opciones(() => json({}));
    await expect(fetchSeguro('http://tienda.ejemplo.com/datos', opts)).rejects.toThrow('URL_NO_PERMITIDA');
    expect(llamadas).toHaveLength(0);
  });

  it('refuses a URL with credentials or a port', async () => {
    const { opts } = opciones(() => json({}));
    await expect(fetchSeguro('https://user:pass@tienda.ejemplo.com/x', opts)).rejects.toThrow('URL_NO_PERMITIDA');
    await expect(fetchSeguro('https://tienda.ejemplo.com:8443/x', opts)).rejects.toThrow('URL_NO_PERMITIDA');
  });

  it('refuses an invalid URL', async () => {
    const { opts } = opciones(() => json({}));
    await expect(fetchSeguro('no es una url', opts)).rejects.toThrow('URL_NO_PERMITIDA');
  });

  it.each([
    ['IPv4 literal', 'https://93.184.216.34/x'],
    ['loopback IPv4 literal', 'https://127.0.0.1/x'],
    ['IPv6 literal', 'https://[::1]/x'],
    ['localhost', 'https://localhost/x'],
    ['localhost with a trailing dot', 'https://localhost./x'],
    ['.local name', 'https://caja.local/x'],
    ['.internal name', 'https://servicio.internal/x'],
    ['.lan name', 'https://router.lan/x'],
    ['.home name', 'https://nas.home/x'],
    ['single label name', 'https://intranet/x'],
  ])('refuses %s without a network call', async (_nombre, url) => {
    const { opts, llamadas } = opciones(() => json({}));
    await expect(fetchSeguro(url, opts)).rejects.toThrow('DESTINO_PRIVADO');
    expect(llamadas).toHaveLength(0);
  });

  it('refuses a public name that resolves to 10.0.0.5', async () => {
    const { opts, llamadas } = opciones(() => json({}));
    await expect(fetchSeguro('https://privado.ejemplo.com/x', opts)).rejects.toThrow('DESTINO_PRIVADO');
    expect(llamadas).toHaveLength(0);
  });

  it('refuses a public name that resolves to 127.0.0.1', async () => {
    const { opts } = opciones(() => json({}));
    await expect(fetchSeguro('https://loopback.ejemplo.com/x', opts)).rejects.toThrow('DESTINO_PRIVADO');
  });

  it('refuses a public name that resolves to ::1', async () => {
    const { opts } = opciones(() => json({}));
    await expect(fetchSeguro('https://loopback6.ejemplo.com/x', opts)).rejects.toThrow('DESTINO_PRIVADO');
  });

  it('refuses when any one of several answers is private', async () => {
    const { opts } = opciones(() => json({}), {
      resolver: resolverFalso({ 'mixto.ejemplo.com': ['93.184.216.34', '192.168.1.10'] }),
    });
    await expect(fetchSeguro('https://mixto.ejemplo.com/x', opts)).rejects.toThrow('DESTINO_PRIVADO');
  });

  it.each([
    ['unique local fd00::1', 'fd00::1'],
    ['link-local fe80::1', 'fe80::1'],
    ['IPv4-mapped 10.0.0.5', '::ffff:10.0.0.5'],
    ['IPv4-mapped in hex form', '::ffff:a00:5'],
    ['IPv4 link-local', '169.254.1.1'],
    ['carrier-grade NAT', '100.64.0.1'],
    ['172.16 range', '172.16.4.4'],
    ['unspecified 0.0.0.0', '0.0.0.0'],
    ['multicast IPv6', 'ff02::1'],
  ])('refuses a name that resolves to %s', async (_nombre, direccion) => {
    const { opts } = opciones(() => json({}), {
      resolver: resolverFalso({ 'raro.ejemplo.com': [direccion] }),
    });
    await expect(fetchSeguro('https://raro.ejemplo.com/x', opts)).rejects.toThrow('DESTINO_PRIVADO');
  });

  it('refuses a name that does not resolve', async () => {
    const { opts } = opciones(() => json({}), {
      resolver: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    await expect(fetchSeguro('https://no-existe.ejemplo.com/x', opts)).rejects.toThrow('URL_NO_PERMITIDA');
  });

  it('refuses a redirect instead of following it', async () => {
    const { opts } = opciones(
      () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    );
    await expect(fetchSeguro('https://tienda.ejemplo.com/x', opts)).rejects.toThrow('RESPUESTA_INVALIDA');
  });

  it('refuses a body larger than the limit', async () => {
    const { opts } = opciones(() => new Response('x'.repeat(100), { status: 200 }), { maxBytes: 10 });
    await expect(fetchSeguro('https://tienda.ejemplo.com/x', opts)).rejects.toThrow('RESPUESTA_INVALIDA');
  });

  it('refuses a non-2xx answer', async () => {
    const { opts } = opciones(() => json({ error: 'caído' }, 500));
    await expect(fetchSeguro('https://tienda.ejemplo.com/x', opts)).rejects.toThrow('RESPUESTA_INVALIDA');
  });

  it('refuses invalid JSON', async () => {
    const { opts } = opciones(() => new Response('no es json', { status: 200 }));
    await expect(fetchSeguro('https://tienda.ejemplo.com/x', opts)).rejects.toThrow('RESPUESTA_INVALIDA');
  });

  it('times out when the server never answers', async () => {
    const { opts } = opciones(() => new Promise<Response>(() => {}), { timeoutMs: 20 });
    await expect(fetchSeguro('https://tienda.ejemplo.com/x', opts)).rejects.toThrow('TIEMPO_AGOTADO');
  });

  it('times out when the DNS lookup never answers', async () => {
    const { opts } = opciones(() => json({}), {
      timeoutMs: 20,
      resolver: () => new Promise<string[]>(() => {}),
    });
    await expect(fetchSeguro('https://tienda.ejemplo.com/x', opts)).rejects.toThrow('TIEMPO_AGOTADO');
  });
});

// LNURL-pay fixtures for the Lightning Address ana@tienda.ejemplo.com.
const META_BASE = {
  tag: 'payRequest',
  callback: 'https://tienda.ejemplo.com/cb',
  minSendable: 1000,
  maxSendable: 1_000_000_000,
  commentAllowed: 0,
  metadata: '[]',
};

function rutaLnurl(meta: unknown, respuesta: unknown) {
  return (url: URL) =>
    url.pathname.startsWith('/.well-known/lnurlp/') ? json(meta) : json(respuesta);
}

describe('pedirFactura', () => {
  it('asks for an invoice for the exact amount and returns it with the verify URL', async () => {
    const { opts, llamadas } = opciones(
      rutaLnurl(META_BASE, { pr: 'lnbc35u1pexample', verify: 'https://tienda.ejemplo.com/verify/abc', routes: [] }),
    );
    const factura = await pedirFactura('ana@tienda.ejemplo.com', 3500, 'Pedido 42', opts);

    expect(factura).toEqual({ bolt11: 'lnbc35u1pexample', verificarUrl: 'https://tienda.ejemplo.com/verify/abc' });
    expect(llamadas[0].url).toBe('https://tienda.ejemplo.com/.well-known/lnurlp/ana');
    const callback = new URL(llamadas[1].url);
    expect(callback.origin + callback.pathname).toBe('https://tienda.ejemplo.com/cb');
    expect(callback.searchParams.get('amount')).toBe('3500000');
  });

  it('returns a null verify URL when the server gives none or a non-https one', async () => {
    const sinVerify = opciones(rutaLnurl(META_BASE, { pr: 'lnbc1pexample' }));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 10, '', sinVerify.opts)).toEqual({
      bolt11: 'lnbc1pexample',
      verificarUrl: null,
    });

    const http = opciones(rutaLnurl(META_BASE, { pr: 'lnbc1pexample', verify: 'http://tienda.ejemplo.com/v' }));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 10, '', http.opts)).toEqual({
      bolt11: 'lnbc1pexample',
      verificarUrl: null,
    });
  });

  it('refuses an amount below minSendable without asking for an invoice', async () => {
    const { opts, llamadas } = opciones(rutaLnurl({ ...META_BASE, minSendable: 2000 }, { pr: 'lnbc1' }));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 1, '', opts)).toBeNull();
    expect(llamadas).toHaveLength(1);
  });

  it('refuses an amount above maxSendable', async () => {
    const { opts } = opciones(rutaLnurl({ ...META_BASE, maxSendable: 1_000_000 }, { pr: 'lnbc1' }));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 2000, '', opts)).toBeNull();
  });

  it('refuses a metadata tag other than payRequest', async () => {
    const { opts, llamadas } = opciones(rutaLnurl({ ...META_BASE, tag: 'withdrawRequest' }, { pr: 'lnbc1' }));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 10, '', opts)).toBeNull();
    expect(llamadas).toHaveLength(1);
  });

  it('refuses a callback on an IP literal', async () => {
    const { opts, llamadas } = opciones(
      rutaLnurl({ ...META_BASE, callback: 'https://10.0.0.5/cb' }, { pr: 'lnbc1' }),
    );
    expect(await pedirFactura('ana@tienda.ejemplo.com', 10, '', opts)).toBeNull();
    expect(llamadas.map((l) => l.url)).toEqual(['https://tienda.ejemplo.com/.well-known/lnurlp/ana']);
  });

  it('refuses a callback whose name resolves to a private address', async () => {
    const { opts, llamadas } = opciones(
      rutaLnurl({ ...META_BASE, callback: 'https://privado.ejemplo.com/cb' }, { pr: 'lnbc1' }),
    );
    expect(await pedirFactura('ana@tienda.ejemplo.com', 10, '', opts)).toBeNull();
    expect(llamadas).toHaveLength(1);
  });

  it('refuses an invoice that does not start with lnbc', async () => {
    const { opts } = opciones(rutaLnurl(META_BASE, { pr: 'lntb1pexample' }));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 10, '', opts)).toBeNull();
  });

  it('refuses an answer with no invoice, such as an LNURL error', async () => {
    const { opts } = opciones(rutaLnurl(META_BASE, { status: 'ERROR', reason: 'sin fondos' }));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 10, '', opts)).toBeNull();
  });

  it('cuts the comment to commentAllowed characters', async () => {
    const { opts, llamadas } = opciones(
      rutaLnurl({ ...META_BASE, commentAllowed: 5 }, { pr: 'lnbc1pexample' }),
    );
    await pedirFactura('ana@tienda.ejemplo.com', 10, 'Pedido de cacao 42', opts);
    expect(new URL(llamadas[1].url).searchParams.get('comment')).toBe('Pedid');
  });

  it('cuts the comment by characters, not by UTF-16 units', async () => {
    const { opts, llamadas } = opciones(
      rutaLnurl({ ...META_BASE, commentAllowed: 2 }, { pr: 'lnbc1pexample' }),
    );
    await pedirFactura('ana@tienda.ejemplo.com', 10, '🍫🍫🍫', opts);
    expect(new URL(llamadas[1].url).searchParams.get('comment')).toBe('🍫🍫');
  });

  it('sends no comment when the server allows none', async () => {
    const { opts, llamadas } = opciones(rutaLnurl(META_BASE, { pr: 'lnbc1pexample' }));
    await pedirFactura('ana@tienda.ejemplo.com', 10, 'Pedido 42', opts);
    expect(new URL(llamadas[1].url).searchParams.has('comment')).toBe(false);
  });

  it('returns null when the metadata request fails', async () => {
    const { opts } = opciones(() => json({ error: 'caído' }, 503));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 10, '', opts)).toBeNull();
  });

  it('returns null for an amount that is not a positive whole number of sats', async () => {
    const { opts, llamadas } = opciones(rutaLnurl(META_BASE, { pr: 'lnbc1' }));
    expect(await pedirFactura('ana@tienda.ejemplo.com', 0, '', opts)).toBeNull();
    expect(await pedirFactura('ana@tienda.ejemplo.com', 2.5, '', opts)).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it('returns null for an address that is not valid, without a network call', async () => {
    const { opts, llamadas } = opciones(rutaLnurl(META_BASE, { pr: 'lnbc1' }));
    expect(await pedirFactura('Ana@tienda.ejemplo.com', 10, '', opts)).toBeNull();
    expect(await pedirFactura('ana@localhost', 10, '', opts)).toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});

describe('verificarPago (LUD-21)', () => {
  const VERIFY = 'https://tienda.ejemplo.com/verify/abc';

  it('is true only when settled is true', async () => {
    const { opts } = opciones(() => json({ settled: true, preimage: null, pr: 'lnbc1' }));
    expect(await verificarPago(VERIFY, opts)).toBe(true);
  });

  it('is false when settled is false', async () => {
    const { opts } = opciones(() => json({ settled: false }));
    expect(await verificarPago(VERIFY, opts)).toBe(false);
  });

  it('is false when settled is not exactly true', async () => {
    const { opts } = opciones(() => json({ settled: 'true' }));
    expect(await verificarPago(VERIFY, opts)).toBe(false);
  });

  it('is false on any error', async () => {
    const { opts } = opciones(() => json({ settled: true }, 500));
    expect(await verificarPago(VERIFY, opts)).toBe(false);
  });

  it('is false for a private verify URL, without a network call', async () => {
    const { opts, llamadas } = opciones(() => json({ settled: true }));
    expect(await verificarPago('https://10.0.0.5/verify', opts)).toBe(false);
    expect(llamadas).toHaveLength(0);
  });

  it('is false when the server does not answer in time', async () => {
    const { opts } = opciones(() => new Promise<Response>(() => {}), { timeoutMs: 20 });
    expect(await verificarPago(VERIFY, opts)).toBe(false);
  });
});

// Lightning Address support: LNURL-pay invoices, LUD-21 payment checks, and a
// fetch that refuses private networks. Server only in practice (uses node:dns).

export type OpcionesRed = {
  fetch?: typeof fetch;
  resolver?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
};

export type FacturaLightning = { bolt11: string; verificarUrl: string | null };

const TIMEOUT_POR_DEFECTO_MS = 5000;
const MAX_BYTES_POR_DEFECTO = 64 * 1024;

// Names that resolve inside a home or company network.
const SUFIJOS_INTERNOS = ['.local', '.internal', '.lan', '.home', '.localhost'];

const REGEX_DIRECCION = /^[a-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export function esDireccionLightning(texto: string): boolean {
  return REGEX_DIRECCION.test(texto) && texto.length <= 254;
}

// Error codes are the first word of the message, so callers can match on them.
function error(codigo: string, mensaje: string): Error {
  return new Error(`${codigo}: ${mensaje}`);
}

function asObjeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function esHttps(texto: string): boolean {
  try {
    return new URL(texto).protocol === 'https:';
  } catch {
    return false;
  }
}

// Kept in a dynamic import so client bundles never load node:dns.
async function resolverPorDefecto(host: string): Promise<string[]> {
  const dns = await import('node:dns/promises');
  const direcciones = await dns.lookup(host, { all: true });
  return direcciones.map((d) => d.address);
}

function ipv4Privada(ip: string): boolean {
  const partes = ip.split('.').map(Number);
  // Anything we cannot read is refused.
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = partes;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    a >= 224 // multicast, reserved, broadcast
  );
}

// Parses an IPv6 address into eight 16-bit groups, or null when it is malformed.
function ipv6Grupos(ip: string): number[] | null {
  let texto = ip.toLowerCase();
  const corte = texto.lastIndexOf(':');
  const cola = texto.slice(corte + 1);
  if (cola.includes('.')) {
    // Dotted tail such as ::ffff:10.0.0.5 becomes two hex groups.
    const v4 = cola.split('.').map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    texto = `${texto.slice(0, corte + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const partes = texto.split('::');
  if (partes.length > 2) return null;
  const cabeza = partes[0] === '' ? [] : partes[0].split(':');
  const resto = partes.length === 2 && partes[1] !== '' ? partes[1].split(':') : [];
  let grupos: string[];
  if (partes.length === 2) {
    const faltan = 8 - cabeza.length - resto.length;
    if (faltan < 1) return null;
    grupos = [...cabeza, ...new Array<string>(faltan).fill('0'), ...resto];
  } else {
    grupos = cabeza;
  }
  if (grupos.length !== 8) return null;
  const numeros = grupos.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : -1));
  return numeros.some((n) => n < 0) ? null : numeros;
}

function ipv6Privada(ip: string): boolean {
  const g = ipv6Grupos(ip);
  if (!g) return true;
  const ceros = (hasta: number) => g.slice(0, hasta).every((n) => n === 0);
  const embebida = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (ceros(8)) return true; // ::
  if (ceros(7) && g[7] === 1) return true; // ::1
  if (ceros(5) && g[5] === 0xffff) return ipv4Privada(embebida); // ::ffff:a.b.c.d
  if (ceros(6)) return ipv4Privada(embebida); // deprecated IPv4-compatible form
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0)) {
    return ipv4Privada(embebida); // NAT64 64:ff9b::/96
  }
  return (
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g[0] & 0xff00) === 0xff00 // ff00::/8 multicast
  );
}

function ipPrivada(ip: string): boolean {
  return ip.includes(':') ? ipv6Privada(ip) : ipv4Privada(ip);
}

// Checks the URL shape before any network call.
function validarUrl(texto: string): URL {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw error('URL_NO_PERMITIDA', 'La dirección no es una URL válida.');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') {
    throw error('URL_NO_PERMITIDA', 'Solo se consultan direcciones https, sin usuario ni puerto.');
  }
  const host = url.hostname.replace(/\.$/, '');
  const esIp = host.startsWith('[') || host.includes(':') || /^[0-9.]+$/.test(host);
  // A name with no dot (such as "localhost") is not a public DNS name.
  const esInterno = !host.includes('.') || SUFIJOS_INTERNOS.some((s) => host.endsWith(s));
  if (esIp || esInterno) {
    throw error('DESTINO_PRIVADO', 'Solo se consultan nombres de dominio públicos.');
  }
  return url;
}

async function comprobarDestino(host: string, resolver: (h: string) => Promise<string[]>): Promise<void> {
  let direcciones: string[];
  try {
    direcciones = await resolver(host);
  } catch {
    throw error('URL_NO_PERMITIDA', 'No se pudo resolver el dominio.');
  }
  if (direcciones.length === 0) throw error('URL_NO_PERMITIDA', 'No se pudo resolver el dominio.');
  // Refuse if any answer is private, not only the first one.
  for (const direccion of direcciones) {
    if (ipPrivada(direccion)) {
      throw error('DESTINO_PRIVADO', 'El dominio apunta a una red privada.');
    }
  }
}

async function leerTexto(res: Response, maxBytes: number): Promise<string> {
  const demasiado = () => error('RESPUESTA_INVALIDA', 'La respuesta es demasiado grande.');
  if (!res.body) {
    const texto = await res.text();
    if (new TextEncoder().encode(texto).byteLength > maxBytes) throw demasiado();
    return texto;
  }
  // Count bytes while reading so a huge body is cut off early.
  const lector = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await lector.cancel();
      throw demasiado();
    }
    partes.push(value);
  }
  const todo = new Uint8Array(total);
  let posicion = 0;
  for (const parte of partes) {
    todo.set(parte, posicion);
    posicion += parte.byteLength;
  }
  return new TextDecoder().decode(todo);
}

async function consultar(
  url: string,
  opciones: OpcionesRed,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  const destino = validarUrl(url);
  await comprobarDestino(destino.hostname, opciones.resolver ?? resolverPorDefecto);

  const fetchImpl: (entrada: string, init: RequestInit) => Promise<Response> =
    opciones.fetch ?? ((entrada, init) => fetch(entrada, init));
  let res: Response;
  try {
    res = await fetchImpl(destino.toString(), {
      redirect: 'manual',
      signal,
      headers: { accept: 'application/json' },
    });
  } catch {
    throw error('RESPUESTA_INVALIDA', 'No se pudo conectar con el servicio.');
  }

  // Redirects are not followed: they could point at another host.
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    throw error('RESPUESTA_INVALIDA', 'El servicio redirigió la consulta, y no seguimos redirecciones.');
  }
  if (!res.ok) throw error('RESPUESTA_INVALIDA', `El servicio respondió con error ${res.status}.`);
  if (Number(res.headers.get('content-length')) > maxBytes) {
    throw error('RESPUESTA_INVALIDA', 'La respuesta es demasiado grande.');
  }

  const texto = await leerTexto(res, maxBytes);
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw error('RESPUESTA_INVALIDA', 'La respuesta no es JSON válido.');
  }
}

// GET that refuses private destinations, redirects, big bodies and slow servers.
export async function fetchSeguro(url: string, opciones: OpcionesRed = {}): Promise<unknown> {
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS;
  const maxBytes = opciones.maxBytes ?? MAX_BYTES_POR_DEFECTO;
  const controlador = new AbortController();
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  // The timer races the whole request, so a fetch that ignores the abort signal still times out.
  const plazo = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => {
      controlador.abort();
      rechazar(error('TIEMPO_AGOTADO', 'El servicio tardó demasiado en responder.'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([consultar(url, opciones, maxBytes, controlador.signal), plazo]);
  } finally {
    clearTimeout(temporizador);
  }
}

// LNURL-pay: asks the address's server for an invoice for an exact amount.
// Returns null on any failure so the caller can show the address and amount instead.
export async function pedirFactura(
  direccion: string,
  sats: number,
  memo: string,
  opciones: OpcionesRed = {},
): Promise<FacturaLightning | null> {
  if (!esDireccionLightning(direccion) || !Number.isInteger(sats) || sats <= 0) return null;
  try {
    const [usuario, dominio] = direccion.split('@');
    const meta = asObjeto(
      await fetchSeguro(`https://${dominio}/.well-known/lnurlp/${encodeURIComponent(usuario)}`, opciones),
    );
    if (!meta || meta.tag !== 'payRequest' || typeof meta.callback !== 'string') return null;

    const minSendable = meta.minSendable;
    const maxSendable = meta.maxSendable;
    const milisats = sats * 1000;
    if (typeof minSendable !== 'number' || typeof maxSendable !== 'number') return null;
    if (milisats < minSendable || milisats > maxSendable) return null;

    const callback = new URL(meta.callback);
    callback.searchParams.set('amount', String(milisats));
    const comentarioPermitido = meta.commentAllowed;
    if (typeof comentarioPermitido === 'number' && comentarioPermitido > 0) {
      // Cut by code points so an emoji is never split in half.
      callback.searchParams.set('comment', Array.from(memo).slice(0, comentarioPermitido).join(''));
    }

    const respuesta = asObjeto(await fetchSeguro(callback.toString(), opciones));
    if (!respuesta || typeof respuesta.pr !== 'string' || !respuesta.pr.startsWith('lnbc')) return null;

    const verify = respuesta.verify;
    const verificarUrl = typeof verify === 'string' && esHttps(verify) ? verify : null;
    return { bolt11: respuesta.pr, verificarUrl };
  } catch {
    return null;
  }
}

// LUD-21: true only when the server says the invoice was settled.
export async function verificarPago(verificarUrl: string, opciones: OpcionesRed = {}): Promise<boolean> {
  try {
    const datos = asObjeto(await fetchSeguro(verificarUrl, opciones));
    return datos !== null && datos.settled === true;
  } catch {
    return false;
  }
}

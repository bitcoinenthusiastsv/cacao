// Shopping cart kept in the browser. Storage can be missing, blocked, or hold junk,
// so every access is guarded and the cart falls back to empty.

export type LineaCarrito = {
  productoId: string;
  negocioId: string;
  negocioNombre: string;
  nombre: string;
  unidad: string;
  precioUsdCentavos: number;
  foto: string | null;
  cantidad: number;
};

export const EVENTO_CARRITO = 'cacaomarket:carrito';

const CLAVE_CARRITO = 'cacaomarket:carrito';
const PREFIJO_IDEMPOTENCIA = 'cacaomarket:idempotencia:';
const MAX_CANTIDAD = 99;

// In-memory copy used when sessionStorage is blocked, so a double tap still reuses the key.
const respaldoIdempotencia = new Map<string, string>();

function ventanaActiva(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function almacenLocal(): Storage | null {
  try {
    return ventanaActiva()?.localStorage ?? null;
  } catch {
    return null;
  }
}

function almacenSesion(): Storage | null {
  try {
    return ventanaActiva()?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function nuevoId(): string {
  const cripto = globalThis.crypto;
  if (cripto && typeof cripto.randomUUID === 'function') return cripto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
}

// Rebuilds a line from scratch so foreign or extra fields never reach the UI.
function limpiarLinea(valor: unknown): LineaCarrito | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const l = valor as Record<string, unknown>;
  const cantidad = l.cantidad;
  const precio = l.precioUsdCentavos;
  const valida =
    typeof l.productoId === 'string' &&
    l.productoId !== '' &&
    typeof l.negocioId === 'string' &&
    typeof l.negocioNombre === 'string' &&
    typeof l.nombre === 'string' &&
    typeof l.unidad === 'string' &&
    (l.foto === null || typeof l.foto === 'string') &&
    Number.isInteger(precio) &&
    (precio as number) > 0 &&
    Number.isInteger(cantidad) &&
    (cantidad as number) >= 1 &&
    (cantidad as number) <= MAX_CANTIDAD;
  if (!valida) return null;
  return {
    productoId: l.productoId as string,
    negocioId: l.negocioId as string,
    negocioNombre: l.negocioNombre as string,
    nombre: l.nombre as string,
    unidad: l.unidad as string,
    precioUsdCentavos: precio as number,
    foto: l.foto as string | null,
    cantidad: cantidad as number,
  };
}

function leer(): LineaCarrito[] {
  try {
    const raw = almacenLocal()?.getItem(CLAVE_CARRITO);
    if (!raw) return [];
    const datos: unknown = JSON.parse(raw);
    if (!Array.isArray(datos)) return [];
    const vistos = new Set<string>();
    const lineas: LineaCarrito[] = [];
    for (const dato of datos) {
      const linea = limpiarLinea(dato);
      if (linea && !vistos.has(linea.productoId)) {
        vistos.add(linea.productoId);
        lineas.push(linea);
      }
    }
    return lineas;
  } catch {
    return [];
  }
}

function guardar(lineas: LineaCarrito[]): LineaCarrito[] {
  try {
    almacenLocal()?.setItem(CLAVE_CARRITO, JSON.stringify(lineas));
  } catch {
    // Storage full or blocked: the new cart still shows for this view.
  }
  try {
    ventanaActiva()?.dispatchEvent(new Event(EVENTO_CARRITO));
  } catch {
    // Listeners are optional.
  }
  return lineas;
}

export function leerCarrito(): LineaCarrito[] {
  return leer();
}

// Adds to an existing line. Name, price and photo are refreshed from the new snapshot.
export function agregarAlCarrito(linea: Omit<LineaCarrito, 'cantidad'>, cantidad: number): LineaCarrito[] {
  if (!ventanaActiva()) return [];
  const lineas = leer();
  if (!Number.isInteger(cantidad) || cantidad < 1) return lineas;
  const indice = lineas.findIndex((l) => l.productoId === linea.productoId);
  const previa = indice >= 0 ? lineas[indice].cantidad : 0;
  const nueva: LineaCarrito = {
    productoId: linea.productoId,
    negocioId: linea.negocioId,
    negocioNombre: linea.negocioNombre,
    nombre: linea.nombre,
    unidad: linea.unidad,
    precioUsdCentavos: linea.precioUsdCentavos,
    foto: linea.foto,
    cantidad: Math.min(MAX_CANTIDAD, previa + cantidad),
  };
  if (indice >= 0) lineas[indice] = nueva;
  else lineas.push(nueva);
  return guardar(lineas);
}

// Zero or less removes the line.
export function cambiarCantidad(productoId: string, cantidad: number): LineaCarrito[] {
  if (!ventanaActiva()) return [];
  const lineas = leer();
  const indice = lineas.findIndex((l) => l.productoId === productoId);
  if (indice < 0 || !Number.isFinite(cantidad)) return lineas;
  const entera = Math.floor(cantidad);
  if (entera <= 0) lineas.splice(indice, 1);
  else lineas[indice] = { ...lineas[indice], cantidad: Math.min(MAX_CANTIDAD, entera) };
  return guardar(lineas);
}

// Called after a shop's order is placed, so the next order gets a new idempotency key.
export function vaciarNegocio(negocioId: string): LineaCarrito[] {
  if (!ventanaActiva()) return [];
  const clave = PREFIJO_IDEMPOTENCIA + negocioId;
  respaldoIdempotencia.delete(clave);
  try {
    almacenSesion()?.removeItem(clave);
  } catch {
    // Nothing to clear.
  }
  return guardar(leer().filter((l) => l.negocioId !== negocioId));
}

export function porNegocio(lineas: LineaCarrito[]): {
  negocioId: string;
  negocioNombre: string;
  lineas: LineaCarrito[];
  totalUsdCentavos: number;
}[] {
  const grupos = new Map<
    string,
    { negocioId: string; negocioNombre: string; lineas: LineaCarrito[]; totalUsdCentavos: number }
  >();
  for (const linea of lineas) {
    let grupo = grupos.get(linea.negocioId);
    if (!grupo) {
      grupo = { negocioId: linea.negocioId, negocioNombre: linea.negocioNombre, lineas: [], totalUsdCentavos: 0 };
      grupos.set(linea.negocioId, grupo);
    }
    grupo.lineas.push(linea);
    grupo.totalUsdCentavos += linea.precioUsdCentavos * linea.cantidad;
  }
  return Array.from(grupos.values());
}

export function contarUnidades(lineas: LineaCarrito[]): number {
  return lineas.reduce((total, l) => total + l.cantidad, 0);
}

// Same key for every tap of one checkout; cleared by vaciarNegocio.
export function claveIdempotencia(negocioId: string): string {
  // Server side: no browser session to keep the key in, so return a fresh one.
  if (!ventanaActiva()) return nuevoId();
  const clave = PREFIJO_IDEMPOTENCIA + negocioId;
  try {
    const almacen = almacenSesion();
    if (almacen) {
      const existente = almacen.getItem(clave);
      if (existente) return existente;
      const nueva = nuevoId();
      almacen.setItem(clave, nueva);
      return nueva;
    }
  } catch {
    // Fall through to the in-memory copy.
  }
  let id = respaldoIdempotencia.get(clave);
  if (!id) {
    id = nuevoId();
    respaldoIdempotencia.set(clave, id);
  }
  return id;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agregarAlCarrito,
  cambiarCantidad,
  claveIdempotencia,
  contarUnidades,
  EVENTO_CARRITO,
  leerCarrito,
  porNegocio,
  vaciarNegocio,
  type LineaCarrito,
} from './carrito';

// Small in-memory stand-in for the Web Storage API.
class AlmacenFalso {
  private datos = new Map<string, string>();
  getItem(clave: string): string | null {
    return this.datos.has(clave) ? (this.datos.get(clave) as string) : null;
  }
  setItem(clave: string, valor: string): void {
    this.datos.set(clave, String(valor));
  }
  removeItem(clave: string): void {
    this.datos.delete(clave);
  }
  clear(): void {
    this.datos.clear();
  }
}

const CLAVE = 'cacaomarket:carrito';

let local: AlmacenFalso;
let sesion: AlmacenFalso;
let despachar: ReturnType<typeof vi.fn>;

function instalarVentana(): void {
  Reflect.set(globalThis, 'window', {
    localStorage: local,
    sessionStorage: sesion,
    dispatchEvent: despachar,
  });
}

function quitarVentana(): void {
  Reflect.deleteProperty(globalThis, 'window');
}

function linea(productoId: string, negocioId: string, precio = 350): Omit<LineaCarrito, 'cantidad'> {
  return {
    productoId,
    negocioId,
    negocioNombre: `Negocio ${negocioId}`,
    nombre: `Producto ${productoId}`,
    unidad: 'libra',
    precioUsdCentavos: precio,
    foto: null,
  };
}

beforeEach(() => {
  local = new AlmacenFalso();
  sesion = new AlmacenFalso();
  despachar = vi.fn();
  instalarVentana();
});

afterEach(() => {
  quitarVentana();
});

describe('agregarAlCarrito and leerCarrito', () => {
  it('adds a new line and reads it back', () => {
    agregarAlCarrito(linea('p1', 'n1'), 2);
    const lineas = leerCarrito();
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ productoId: 'p1', negocioId: 'n1', cantidad: 2, precioUsdCentavos: 350 });
  });

  it('adds to the existing line instead of creating a second one', () => {
    agregarAlCarrito(linea('p1', 'n1'), 2);
    agregarAlCarrito(linea('p1', 'n1'), 3);
    const lineas = leerCarrito();
    expect(lineas).toHaveLength(1);
    expect(lineas[0].cantidad).toBe(5);
  });

  it('refreshes the price from the new snapshot when the product is added again', () => {
    agregarAlCarrito(linea('p1', 'n1', 350), 1);
    agregarAlCarrito(linea('p1', 'n1', 400), 1);
    expect(leerCarrito()[0].precioUsdCentavos).toBe(400);
  });

  it('caps the quantity at 99', () => {
    agregarAlCarrito(linea('p1', 'n1'), 90);
    expect(agregarAlCarrito(linea('p1', 'n1'), 20)[0].cantidad).toBe(99);
    expect(agregarAlCarrito(linea('p2', 'n1'), 500)[1].cantidad).toBe(99);
  });

  it('ignores a quantity that is not a positive whole number', () => {
    agregarAlCarrito(linea('p1', 'n1'), 2);
    expect(agregarAlCarrito(linea('p1', 'n1'), 0)[0].cantidad).toBe(2);
    expect(agregarAlCarrito(linea('p1', 'n1'), -4)[0].cantidad).toBe(2);
    expect(agregarAlCarrito(linea('p1', 'n1'), 1.5)[0].cantidad).toBe(2);
  });

  it('dispatches the cart event after a change', () => {
    agregarAlCarrito(linea('p1', 'n1'), 1);
    expect(despachar).toHaveBeenCalledTimes(1);
    const evento = despachar.mock.calls[0][0] as Event;
    expect(evento.type).toBe(EVENTO_CARRITO);
  });
});

describe('cambiarCantidad', () => {
  beforeEach(() => {
    agregarAlCarrito(linea('p1', 'n1'), 2);
  });

  it('sets the quantity', () => {
    expect(cambiarCantidad('p1', 7)[0].cantidad).toBe(7);
  });

  it('caps the quantity at 99', () => {
    expect(cambiarCantidad('p1', 150)[0].cantidad).toBe(99);
  });

  it('removes the line for zero or less', () => {
    expect(cambiarCantidad('p1', 0)).toEqual([]);
    agregarAlCarrito(linea('p1', 'n1'), 2);
    expect(cambiarCantidad('p1', -3)).toEqual([]);
  });

  it('leaves the cart alone for an unknown product or a NaN quantity', () => {
    expect(cambiarCantidad('nope', 4)).toHaveLength(1);
    expect(cambiarCantidad('p1', Number.NaN)[0].cantidad).toBe(2);
  });
});

describe('vaciarNegocio', () => {
  it('removes only the lines of that shop and clears its idempotency key', () => {
    agregarAlCarrito(linea('p1', 'n1'), 1);
    agregarAlCarrito(linea('p2', 'n2'), 1);
    const claveAntes = claveIdempotencia('n1');

    const restantes = vaciarNegocio('n1');

    expect(restantes.map((l) => l.productoId)).toEqual(['p2']);
    expect(claveIdempotencia('n1')).not.toBe(claveAntes);
    expect(claveIdempotencia('n2')).toBeTruthy();
  });
});

describe('porNegocio and contarUnidades', () => {
  it('groups lines by shop in order of first appearance, with totals', () => {
    const lineas: LineaCarrito[] = [
      { ...linea('p1', 'n1', 350), cantidad: 2 },
      { ...linea('p2', 'n2', 1000), cantidad: 1 },
      { ...linea('p3', 'n1', 125), cantidad: 4 },
    ];
    const grupos = porNegocio(lineas);
    expect(grupos.map((g) => g.negocioId)).toEqual(['n1', 'n2']);
    expect(grupos[0].lineas.map((l) => l.productoId)).toEqual(['p1', 'p3']);
    expect(grupos[0].totalUsdCentavos).toBe(350 * 2 + 125 * 4);
    expect(grupos[1].totalUsdCentavos).toBe(1000);
    expect(grupos[0].negocioNombre).toBe('Negocio n1');
  });

  it('counts units across all lines', () => {
    const lineas: LineaCarrito[] = [
      { ...linea('p1', 'n1'), cantidad: 2 },
      { ...linea('p2', 'n2'), cantidad: 5 },
    ];
    expect(contarUnidades(lineas)).toBe(7);
    expect(contarUnidades([])).toBe(0);
  });
});

describe('storage that is corrupt, foreign, or failing', () => {
  it('treats unparseable JSON as an empty cart and recovers on the next write', () => {
    local.setItem(CLAVE, '{no es json');
    expect(leerCarrito()).toEqual([]);
    agregarAlCarrito(linea('p1', 'n1'), 1);
    expect(leerCarrito()).toHaveLength(1);
  });

  it('treats a non-array as an empty cart', () => {
    local.setItem(CLAVE, JSON.stringify({ productoId: 'p1' }));
    expect(leerCarrito()).toEqual([]);
  });

  it('drops lines with the wrong shape and keeps the valid ones', () => {
    local.setItem(
      CLAVE,
      JSON.stringify([
        { productoId: 'bueno', negocioId: 'n1', negocioNombre: 'N', nombre: 'P', unidad: 'u', precioUsdCentavos: 350, foto: null, cantidad: 2 },
        { productoId: 'sin-cantidad', negocioId: 'n1', negocioNombre: 'N', nombre: 'P', unidad: 'u', precioUsdCentavos: 350, foto: null },
        { productoId: 'cantidad-cero', negocioId: 'n1', negocioNombre: 'N', nombre: 'P', unidad: 'u', precioUsdCentavos: 350, foto: null, cantidad: 0 },
        { productoId: 'precio-texto', negocioId: 'n1', negocioNombre: 'N', nombre: 'P', unidad: 'u', precioUsdCentavos: '350', foto: null, cantidad: 1 },
        { productoId: 'foto-rara', negocioId: 'n1', negocioNombre: 'N', nombre: 'P', unidad: 'u', precioUsdCentavos: 350, foto: 42, cantidad: 1 },
        null,
        'texto',
      ]),
    );
    const lineas = leerCarrito();
    expect(lineas.map((l) => l.productoId)).toEqual(['bueno']);
  });

  it('strips fields the cart does not know about', () => {
    local.setItem(
      CLAVE,
      JSON.stringify([
        { productoId: 'p1', negocioId: 'n1', negocioNombre: 'N', nombre: 'P', unidad: 'u', precioUsdCentavos: 350, foto: null, cantidad: 1, script: '<b>x</b>' },
      ]),
    );
    expect(Object.keys(leerCarrito()[0]).sort()).toEqual(
      ['cantidad', 'foto', 'negocioId', 'negocioNombre', 'nombre', 'precioUsdCentavos', 'productoId', 'unidad'],
    );
  });

  it('keeps only the first line of a repeated product', () => {
    const fila = { productoId: 'p1', negocioId: 'n1', negocioNombre: 'N', nombre: 'P', unidad: 'u', precioUsdCentavos: 350, foto: null };
    local.setItem(CLAVE, JSON.stringify([{ ...fila, cantidad: 1 }, { ...fila, cantidad: 9 }]));
    expect(leerCarrito()).toHaveLength(1);
  });

  it('does not throw when localStorage access itself throws', () => {
    Reflect.set(globalThis, 'window', {
      get localStorage(): never {
        throw new Error('SecurityError');
      },
      sessionStorage: sesion,
      dispatchEvent: despachar,
    });
    expect(leerCarrito()).toEqual([]);
    expect(() => agregarAlCarrito(linea('p1', 'n1'), 1)).not.toThrow();
  });

  it('returns the new cart even when writing to storage fails', () => {
    local.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const lineas = agregarAlCarrito(linea('p1', 'n1'), 1);
    expect(lineas).toHaveLength(1);
  });
});

describe('server side (no window)', () => {
  beforeEach(() => {
    quitarVentana();
  });

  it('every cart function returns an empty cart', () => {
    expect(leerCarrito()).toEqual([]);
    expect(agregarAlCarrito(linea('p1', 'n1'), 1)).toEqual([]);
    expect(cambiarCantidad('p1', 3)).toEqual([]);
    expect(vaciarNegocio('n1')).toEqual([]);
  });

  it('idempotency key is a fresh value each time and nothing is stored', () => {
    const a = claveIdempotencia('n1');
    const b = claveIdempotencia('n1');
    expect(typeof a).toBe('string');
    expect(a).not.toBe(b);
  });
});

describe('claveIdempotencia', () => {
  it('returns the same key for every call for one shop', () => {
    expect(claveIdempotencia('n1')).toBe(claveIdempotencia('n1'));
  });

  it('returns a different key for a different shop', () => {
    expect(claveIdempotencia('n1')).not.toBe(claveIdempotencia('n2'));
  });

  it('keeps the key in sessionStorage, per shop', () => {
    const clave = claveIdempotencia('n1');
    expect(sesion.getItem('cacaomarket:idempotencia:n1')).toBe(clave);
  });

  it('issues a new key after the shop cart is emptied', () => {
    const antes = claveIdempotencia('n1');
    vaciarNegocio('n1');
    expect(claveIdempotencia('n1')).not.toBe(antes);
  });

  it('still returns one stable key when sessionStorage throws', () => {
    Reflect.set(globalThis, 'window', {
      localStorage: local,
      get sessionStorage(): never {
        throw new Error('SecurityError');
      },
      dispatchEvent: despachar,
    });
    const primera = claveIdempotencia('n1');
    expect(primera).toBeTruthy();
    expect(claveIdempotencia('n1')).toBe(primera);
  });
});

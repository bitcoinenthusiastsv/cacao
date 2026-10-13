// Reads a USD price as the seller types it. Pure, so the form can preview it and the server can
// check it again. Floats are never used for money: the price is split into dollars and cents.

export const PRECIO_MAXIMO_CENTAVOS = 1_000_000; // $10,000
export const STOCK_MAXIMO = 100_000;

export type PrecioLeido = { ok: true; centavos: number } | { ok: false; mensaje: string };

export function precioACentavos(texto: string): PrecioLeido {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') {
    return { ok: false, mensaje: 'Escribí el precio en dólares, por ejemplo 3.50.' };
  }
  if (limpio.startsWith('-')) {
    return { ok: false, mensaje: 'El precio no puede ser negativo.' };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) {
    return { ok: false, mensaje: 'Escribí el precio con hasta dos decimales, por ejemplo 3.50.' };
  }

  const [dolares, decimales = ''] = limpio.split('.');
  // Pad the decimals to two places: "5" is 50 cents, "05" is 5 cents.
  const centavos = Number(dolares) * 100 + Number((decimales + '00').slice(0, 2));

  if (centavos <= 0) return { ok: false, mensaje: 'El precio tiene que ser mayor que cero.' };
  if (centavos > PRECIO_MAXIMO_CENTAVOS) {
    return { ok: false, mensaje: 'El precio no puede pasar de $10,000.' };
  }
  return { ok: true, centavos };
}

/** Whole number inside [minimo, maximo], typed as text. Null when it is not one. */
export function enteroEnRango(texto: string, minimo: number, maximo: number): number | null {
  const limpio = texto.trim();
  if (!/^\d{1,9}$/.test(limpio)) return null;
  const n = Number(limpio);
  return n >= minimo && n <= maximo ? n : null;
}

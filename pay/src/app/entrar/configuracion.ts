import 'server-only';

// Sign-in methods and demo access, read from public variables. Next.js fixes NEXT_PUBLIC_*
// values when the dev server starts, so a change needs a restart.

export type Metodo = 'telefono' | 'correo';

const METODOS: Metodo[] = ['telefono', 'correo'];

/**
 * The enabled methods, in the order they are shown. The first one is the default.
 * NEXT_PUBLIC_INGRESO is a comma list; unknown names are ignored. Unset or empty means both.
 */
export function metodosHabilitados(): Metodo[] {
  const crudo = process.env.NEXT_PUBLIC_INGRESO ?? '';
  const elegidos: Metodo[] = [];
  for (const parte of crudo.split(',')) {
    const nombre = parte.trim().toLowerCase() as Metodo;
    if (METODOS.includes(nombre) && !elegidos.includes(nombre)) elegidos.push(nombre);
  }
  return elegidos.length > 0 ? elegidos : [...METODOS];
}

/** Picks the method the URL asks for, when it is enabled; otherwise the first enabled one. */
export function metodoElegido(pedido: string | string[] | undefined, habilitados: Metodo[]): Metodo {
  const texto = Array.isArray(pedido) ? pedido[0] : pedido;
  const elegido = habilitados.find((m) => m === texto);
  return elegido ?? habilitados[0];
}

/** Demo accounts are on only when NEXT_PUBLIC_DEMO is exactly 1. */
export function demoActivo(): boolean {
  return process.env.NEXT_PUBLIC_DEMO === '1';
}

// Result of every mutation, so pages can show the Spanish sentence the database wrote.
// No 'server-only' here: Client Components import the type.

export type Resultado<T> = { ok: true; dato: T } | { ok: false; codigo: string; mensaje: string };

export function exito<T>(dato: T): Resultado<T> {
  return { ok: true, dato };
}

export function fallo(codigo: string, mensaje: string): Resultado<never> {
  return { ok: false, codigo, mensaje };
}

const CON_CODIGO = /^([A-Z_]+):\s*([\s\S]+)$/;

/**
 * Turns a database or adapter error into a Resultado. Functions raise "CODIGO: frase";
 * anything else is unexpected, so the user gets a generic sentence and the detail stays in the log.
 */
export function desdeError(error: unknown): Resultado<never> {
  const texto =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  const partes = CON_CODIGO.exec(texto.trim());
  if (partes) return fallo(partes[1], partes[2].trim());
  console.error('Error inesperado:', texto);
  return fallo('ERROR', 'Algo falló de nuestro lado. Probá de nuevo en un momento.');
}

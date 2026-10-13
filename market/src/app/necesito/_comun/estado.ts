// Shared by the action files and the client forms. Not a server module: client components import it.

// What a form action returns when it does not redirect. Failures carry the database sentence as is.
export type EstadoAccion = { ok: boolean; mensaje: string | null };

export const ESTADO_INICIAL: EstadoAccion = { ok: true, mensaje: null };

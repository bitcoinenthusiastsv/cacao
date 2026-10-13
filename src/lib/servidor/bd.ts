// Database client for Cacao Media's server routes.
//
// Media shares one Supabase project with CacaoMarket and CacaoPay. Its tables start with `media_`
// and are closed to browsers: only server code reads and writes them, with the service-role key.
// Never import this file from a page's client script.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Astro exposes .env values through import.meta.env; a deployed function has them in process.env.
function variable(nombre: string): string | undefined {
  const deAstro = (import.meta.env as Record<string, string | undefined>)[nombre];
  return deAstro ?? process.env[nombre];
}

let cliente: SupabaseClient | null = null;

/** True when the database is configured. Pages degrade to "no payments available" when it is not. */
export function hayBase(): boolean {
  return Boolean(variable('SUPABASE_URL') && variable('SUPABASE_SERVICE_ROLE_KEY'));
}

export function bd(): SupabaseClient {
  if (cliente) return cliente;
  const url = variable('SUPABASE_URL');
  const clave = variable('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !clave) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }
  cliente = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

/**
 * Database functions raise "CODIGO: frase". This splits the two so a route can answer with the
 * sentence and choose a status from the code. Anything else is unexpected and stays in the log.
 */
export function leerError(error: unknown): { codigo: string; mensaje: string } {
  const texto =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  const partes = /^([A-Z_]+):\s*([\s\S]+)$/.exec(texto.trim());
  if (partes) return { codigo: partes[1], mensaje: partes[2].trim() };
  console.error('Error inesperado de base de datos:', texto);
  return { codigo: 'ERROR', mensaje: 'Algo falló de nuestro lado. Probá de nuevo en un momento.' };
}

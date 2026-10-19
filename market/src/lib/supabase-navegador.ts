'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/tipos/db';

// Browser client: read-only by design (the database grants only SELECT to sessions).
// Used for live updates (Realtime) and for reads that run as the signed-in person. One instance per tab.
// Its token comes from the Clerk session, which SesionNavegador hands over on mount.
type ObtenerToken = () => Promise<string | null>;

let obtenerToken: ObtenerToken = async () => null;
let cliente: SupabaseClient<Database> | null = null;

export function clienteNavegador(): SupabaseClient<Database> {
  if (!cliente) {
    cliente = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      accessToken: () => obtenerToken(),
    });
  }
  return cliente;
}

/** Sets where the browser client reads the Clerk session token. Called once from SesionNavegador. */
export function fijarObtenerToken(fuente: ObtenerToken): void {
  obtenerToken = fuente;
}

/** The current Clerk session token, or null when nobody is signed in. */
export function tokenNavegador(): Promise<string | null> {
  return obtenerToken();
}

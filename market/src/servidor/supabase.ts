import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { connection } from 'next/server';

import type { Database } from '@/tipos/db';

function configuracionPublica() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.');
  }
  return { url, clave };
}

/**
 * Client for the current visitor. Row-level security applies: the Clerk session token goes to
 * Supabase as the bearer, and public.usuario_actual() matches its sub claim.
 * Reads the request (the Clerk session), so it can only run inside a request (wrap callers in Suspense).
 */
export async function clienteSesion() {
  const { url, clave } = configuracionPublica();
  // Clerk checks the token's expiry against the clock, so this read happens at request time.
  await connection();
  return createClient<Database>(url, clave, {
    accessToken: async () => {
      const { getToken } = await auth();
      return (await getToken()) ?? null;
    },
  });
}

/**
 * Service-role client: bypasses row-level security.
 * Only server code that has already checked the session may use it, and never from a Client Component.
 * It keeps the service key on purpose: a Clerk token would turn the request into the visitor's role.
 */
export function clienteServicio() {
  const { url } = configuracionPublica();
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  }
  return createClient<Database>(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next shares identical GET requests within one render. This client reads a row, writes it and
    // reads it again in the same render (the payment screen does), so the second read must be real.
    // A signal on the request is the documented way to opt out.
    global: { fetch: (entrada, opciones) => fetch(entrada, { ...opciones, signal: opciones?.signal ?? new AbortController().signal }) },
  });
}

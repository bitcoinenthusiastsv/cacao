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
 * Supabase, and usuario_actual() reads its subject. Reads the request, so it can only run inside
 * a request (wrap callers in Suspense).
 */
export async function clienteSesion() {
  const { url, clave } = configuracionPublica();
  // The session check reads the clock (token expiry). With partial prefetching, a request-bound
  // read alone still counts as prerenderable, so wait for the real request first.
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
 * No accessToken here: it would replace the service-role key in the Authorization header.
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
    // reads it again in the same render (a transfer screen does), so the second read must be real.
    // A signal on the request is the documented way to opt out.
    global: { fetch: (entrada, opciones) => fetch(entrada, { ...opciones, signal: opciones?.signal ?? new AbortController().signal }) },
  });
}

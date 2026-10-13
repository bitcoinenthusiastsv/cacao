import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
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
 * Client for the current visitor. Row-level security applies.
 * Reads cookies, so it can only run inside a request (wrap callers in Suspense).
 */
export async function clienteSesion() {
  const { url, clave } = configuracionPublica();
  // The auth client reads the clock (token expiry). With partial prefetching, cookies() alone
  // still counts as prerenderable, so wait for the real request before building the client.
  await connection();
  // cookies() is async in Next 16.
  const almacen = await cookies();
  return createServerClient<Database>(url, clave, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(paraEscribir) {
        try {
          for (const { name, value, options } of paraEscribir) {
            almacen.set({ name, value, ...options });
          }
        } catch {
          // Server Components cannot write cookies. Refreshing the session belongs to a
          // route handler or the proxy, so a failed write here is expected, not an error.
        }
      },
    },
  });
}

/**
 * Service-role client: bypasses row-level security.
 * Only server code that has already checked the session may use it, and never from a Client Component.
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

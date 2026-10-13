'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/tipos/db';

// Browser client: read-only by design (the database grants only SELECT to sessions).
// Used for live updates (Realtime) and for signing in. One instance per tab.
let cliente: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function clienteNavegador() {
  if (!cliente) {
    cliente = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return cliente;
}

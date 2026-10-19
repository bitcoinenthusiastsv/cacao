'use client';

import { clienteNavegador, tokenNavegador } from '@/lib/supabase-navegador';

// Realtime only delivers rows the signed-in user may read when the socket carries their token.
// Set the token before a channel joins, and refresh it while the page stays open: Clerk tokens are short-lived.
const INTERVALO_TOKEN_MS = 50_000;

let refrescando = false;

export async function clienteEnVivo() {
  const cliente = clienteNavegador();
  const token = await tokenNavegador();
  if (token) await cliente.realtime.setAuth(token);
  if (!refrescando) {
    refrescando = true;
    setInterval(() => {
      void tokenNavegador().then((nuevo) => {
        if (nuevo) void cliente.realtime.setAuth(nuevo);
      });
    }, INTERVALO_TOKEN_MS);
  }
  return cliente;
}

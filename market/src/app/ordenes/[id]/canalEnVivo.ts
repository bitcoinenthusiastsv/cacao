'use client';

import { clienteNavegador, tokenNavegador } from '@/lib/supabase-navegador';

// Realtime only delivers rows the signed-in user may read when the socket carries their token.
// Set the token before a channel joins, and refresh it while the page stays open: Clerk tokens are short-lived.
const INTERVALO_TOKEN_MS = 50_000;

let refrescando = false;

// No fresh token (signed out, or the lookup failed) clears the old one. Keeping it would leave the
// socket on a token that may already have expired.
function renovarToken(cliente: ReturnType<typeof clienteNavegador>) {
  tokenNavegador()
    .catch(() => null)
    .then((nuevo) => cliente.realtime.setAuth(nuevo))
    .catch(() => {
      // The next tick tries again.
    });
}

export async function clienteEnVivo() {
  const cliente = clienteNavegador();
  const token = await tokenNavegador();
  if (token) await cliente.realtime.setAuth(token);
  if (!refrescando) {
    refrescando = true;
    setInterval(() => renovarToken(cliente), INTERVALO_TOKEN_MS);
  }
  return cliente;
}

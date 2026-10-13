'use client';

import { clienteNavegador } from '@/lib/supabase-navegador';

// Realtime only delivers rows the signed-in user may read when the socket carries their token.
// The browser client does not send it when a page opens with a cookie session, so events would
// arrive as anonymous and never match. Set the token before a channel joins, and again on refresh.
let escuchando = false;

export async function clienteEnVivo() {
  const cliente = clienteNavegador();
  if (!escuchando) {
    escuchando = true;
    cliente.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion) void cliente.realtime.setAuth(sesion.access_token);
    });
  }
  const { data } = await cliente.auth.getSession();
  if (data.session) await cliente.realtime.setAuth(data.session.access_token);
  return cliente;
}

import 'server-only';

import { clienteServicio } from './supabase';

/**
 * Expires unpaid orders (stock comes back) and closes delivered ones after 48 h.
 * There is no scheduler in the local setup, so pages that show orders call this first.
 * Failures are logged, never thrown: a page must still render.
 */
export async function barrer(): Promise<void> {
  const servicio = clienteServicio();
  const [expiradas, cerradas] = await Promise.all([
    servicio.rpc('expirar_ordenes'),
    servicio.rpc('cerrar_ordenes'),
  ]);
  if (expiradas.error) console.error('expirar_ordenes:', expiradas.error.message);
  if (cerradas.error) console.error('cerrar_ordenes:', cerradas.error.message);
}

// Admin access for the Cacao Media panel. Server only.
//
// A visitor needs a Clerk session and a usuarios row with es_admin = true that belongs to that Clerk
// user. The row is linked on each check with vincular_clerk, which only the service role can run,
// the same way CacaoMarket links its sign-ins. A missing database counts as no access.
import type { AstroGlobal } from 'astro';
import { bd, hayBase, leerError } from './bd';

export type AccesoAdmin =
  | { estado: 'sin-sesion' }
  | { estado: 'sin-permiso' }
  | { estado: 'admin' };

export async function accesoAdmin(astro: Pick<AstroGlobal, 'locals'>): Promise<AccesoAdmin> {
  const { isAuthenticated, userId } = astro.locals.auth();
  if (!isAuthenticated || !userId) return { estado: 'sin-sesion' };
  if (!hayBase()) return { estado: 'sin-permiso' };

  const cuenta = await astro.locals.currentUser();
  if (!cuenta) return { estado: 'sin-permiso' };

  // Phone and email come from the Clerk record. The database keeps digits only for the phone.
  // Only a verified phone or email may link an existing row; an unverified one is sent as empty.
  const telefonoVinculo =
    cuenta.primaryPhoneNumber?.verification?.status === 'verified' ? cuenta.primaryPhoneNumber.phoneNumber : '';
  const correoVinculo =
    cuenta.primaryEmailAddress?.verification?.status === 'verified' ? cuenta.primaryEmailAddress.emailAddress : '';
  const servicio = bd();
  const { data: id, error } = await servicio.rpc('vincular_clerk', {
    p_clerk_id: userId,
    p_telefono: telefonoVinculo,
    p_correo: correoVinculo,
    p_nombre: cuenta.fullName ?? '',
  });
  if (error || !id) {
    if (error) console.error('No se pudo vincular la cuenta de Clerk:', leerError(error).codigo);
    return { estado: 'sin-permiso' };
  }

  // Columns are named on purpose: the database grants column by column.
  const { data: perfil } = await servicio.from('usuarios').select('es_admin').eq('id', id).maybeSingle();
  return perfil?.es_admin === true ? { estado: 'admin' } : { estado: 'sin-permiso' };
}

/** Answer for a signed-in visitor who is not an admin: the panel does not exist for them. */
export function noEncontrado(): Response {
  return new Response('Página no encontrada.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

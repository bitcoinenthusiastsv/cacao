import 'server-only';

import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { clienteSesion } from './supabase';

export type Sesion = {
  // A person signs in by phone or by email, so one of the two is empty.
  usuario: { id: string; nombre: string; esAdmin: boolean; telefono: string; correo: string };
};

// cache() keeps one lookup per request, however many components ask.
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const supabase = await clienteSesion();
  // getUser() checks the token with the auth server; getSession() would trust the cookie.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const id = data.user.id;

  // Columns are named on purpose: the database grants column by column.
  const { data: perfil } = await supabase
    .from('usuarios')
    .select('id, nombre, es_admin')
    .eq('id', id)
    .maybeSingle();
  if (!perfil) return null;

  return {
    usuario: {
      id,
      nombre: perfil.nombre,
      esAdmin: perfil.es_admin,
      // Phone and email come from the user's own token, never from a table read.
      telefono: data.user.phone ?? '',
      correo: data.user.email ?? '',
    },
  };
});

/** Sends the visitor to /entrar and back to `volver` after signing in. */
export async function exigirSesion(volver?: string): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) {
    redirect(volver ? `/entrar?volver=${encodeURIComponent(volver)}` : '/entrar');
  }
  return sesion;
}

/** Not an admin: the page does not exist. */
export async function exigirAdmin(volver: string): Promise<Sesion> {
  const sesion = await exigirSesion(volver);
  if (!sesion.usuario.esAdmin) notFound();
  return sesion;
}

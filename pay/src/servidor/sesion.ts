import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';

import { clienteServicio } from './supabase';

export type Sesion = {
  // A person signs in by phone or by email, so one of the two is empty.
  usuario: { id: string; nombre: string; esAdmin: boolean; telefono: string; correo: string };
};

// cache() keeps one lookup per request, however many components ask.
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  // The session check reads the clock; this keeps that read at request time.
  await connection();
  const { userId } = await auth();
  if (!userId) return null;

  const cuenta = await currentUser();
  if (!cuenta) return null;
  // Phone and email come from the user's own Clerk record, never from a table read.
  const telefono = cuenta.primaryPhoneNumber?.phoneNumber ?? '';
  const correo = cuenta.primaryEmailAddress?.emailAddress ?? '';

  // Creates the row on first sign-in, or links the existing one by phone or email. The database
  // returns the usuarios id. The service role does this, since the visitor has no row yet.
  const servicio = clienteServicio();
  const { data: id, error } = await servicio.rpc('vincular_clerk', {
    p_clerk_id: userId,
    p_telefono: telefono,
    p_correo: correo,
    p_nombre: cuenta.fullName ?? '',
  });
  if (error || !id) return null;

  // Columns are named on purpose: the database grants column by column.
  const { data: perfil } = await servicio
    .from('usuarios')
    .select('id, nombre, es_admin')
    .eq('id', id)
    .maybeSingle();
  if (!perfil) return null;

  return {
    usuario: {
      id: perfil.id,
      nombre: perfil.nombre,
      esAdmin: perfil.es_admin,
      telefono,
      correo,
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

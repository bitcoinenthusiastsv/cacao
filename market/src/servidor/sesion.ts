import 'server-only';

import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { clienteSesion } from './supabase';

export type Sesion = {
  // A person signs in by phone or by email, so one of the two is empty.
  usuario: { id: string; nombre: string; esAdmin: boolean; telefono: string; correo: string };
  negocio: {
    id: string;
    nombre: string;
    estado: 'pendiente' | 'aprobado' | 'suspendido';
    abierto: boolean;
  } | null;
};

export type SesionVendedor = Sesion & { negocio: NonNullable<Sesion['negocio']> };

// cache() keeps one lookup per request, however many components ask.
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const supabase = await clienteSesion();
  // getUser() checks the token with the auth server; getSession() would trust the cookie.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const id = data.user.id;

  // Columns are named on purpose: the database grants column by column on both tables.
  const [perfil, negocio] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, es_admin').eq('id', id).maybeSingle(),
    supabase.from('negocios').select('id, nombre, estado, abierto').eq('usuario_id', id).maybeSingle(),
  ]);
  if (!perfil.data) return null;

  return {
    usuario: {
      id,
      nombre: perfil.data.nombre,
      esAdmin: perfil.data.es_admin,
      // Phone and email come from the user's own token, never from a table read.
      telefono: data.user.phone ?? '',
      correo: data.user.email ?? '',
    },
    negocio: negocio.data
      ? {
          id: negocio.data.id,
          nombre: negocio.data.nombre,
          estado: negocio.data.estado,
          abierto: negocio.data.abierto,
        }
      : null,
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

/** A signed-in user without a shop goes to /mi-negocio, where they can apply. */
export async function exigirVendedor(volver?: string): Promise<SesionVendedor> {
  const sesion = await exigirSesion(volver);
  if (!sesion.negocio) redirect('/mi-negocio');
  return sesion as SesionVendedor;
}

/** Not an admin: the page does not exist. */
export async function exigirAdmin(): Promise<Sesion> {
  const sesion = await exigirSesion('/admin');
  if (!sesion.usuario.esAdmin) notFound();
  return sesion;
}

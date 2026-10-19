import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';

import { clienteServicio } from './supabase';

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
  // Clerk reads the request and the clock; this keeps that read at request time.
  await connection();
  const { userId } = await auth();
  if (!userId) return null;

  // Phone and email come from the Clerk user, never from a table read. Clerk gives them in E.164.
  const cuenta = await currentUser();
  const telefono = cuenta?.primaryPhoneNumber?.phoneNumber ?? '';
  const correo = cuenta?.primaryEmailAddress?.emailAddress ?? '';

  // Creates the usuarios row on first visit, or links the existing one by phone or email.
  const supabase = clienteServicio();
  const { data: usuarioId, error: errorVinculo } = await supabase.rpc('vincular_clerk', {
    p_clerk_id: userId,
    p_telefono: telefono,
    p_correo: correo,
    p_nombre: cuenta?.fullName ?? '',
  });
  if (errorVinculo || !usuarioId) {
    if (errorVinculo) console.error('vincular_clerk:', errorVinculo.code, errorVinculo.message);
    return null;
  }

  // Columns are named on purpose: the database grants column by column on both tables.
  const [perfil, negocio] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, es_admin').eq('id', usuarioId).maybeSingle(),
    supabase.from('negocios').select('id, nombre, estado, abierto').eq('usuario_id', usuarioId).maybeSingle(),
  ]);
  if (!perfil.data) return null;

  return {
    usuario: {
      id: usuarioId,
      nombre: perfil.data.nombre,
      esAdmin: perfil.data.es_admin,
      telefono,
      correo,
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

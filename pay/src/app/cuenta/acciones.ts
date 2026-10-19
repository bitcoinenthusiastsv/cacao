'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { actualizarPerfil, destinoSeguro } from '@/servidor/cuentas';
import { exigirSesion } from '@/servidor/sesion';

export type EstadoNombre = {
  nombre: string;
  error?: string;
  mensaje?: string;
};

export async function guardarNombre(previo: EstadoNombre, datos: FormData): Promise<EstadoNombre> {
  const sesion = await exigirSesion('/cuenta');
  const nombre = String(datos.get('nombre') ?? '');
  const volver = destinoSeguro(datos.get('volver') as string | null);

  const resultado = await actualizarPerfil(sesion.usuario.id, nombre);
  if (!resultado.ok) return { nombre, error: resultado.mensaje };

  // The header shows the first name, so the root layout must render again.
  revalidatePath('/', 'layout');
  // A visitor who came from a page that needs a name goes back there.
  if (volver !== '/') redirect(volver);
  return { nombre: resultado.dato.nombre, mensaje: 'Guardamos tu nombre.' };
}

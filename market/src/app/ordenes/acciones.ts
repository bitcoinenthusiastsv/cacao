'use server';

import { revalidatePath } from 'next/cache';

import { fallo, type Resultado } from '@/servidor/resultado';
import { marcarLeidos } from '@/servidor/avisos';
import { sesionActual } from '@/servidor/sesion';

/** Marks the signed-in user's notices as read. The badge in the layout is refreshed too. */
export async function marcarAvisosLeidos(): Promise<Resultado<number>> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_SESION', 'Entrá de nuevo para ver tus avisos.');
  const resultado = await marcarLeidos(sesion.usuario.id);
  if (resultado.ok) {
    revalidatePath('/ordenes');
    revalidatePath('/', 'layout');
  }
  return resultado;
}

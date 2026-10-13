'use server';

import { redirect } from 'next/navigation';

import type { DatosProducto } from '@/app/mi-negocio/productos/_comun/tipos';
import { cambiarActivo, cambiarStock, guardarProducto } from '@/servidor/productos';
import { fallo, type Resultado } from '@/servidor/resultado';
import { sesionActual } from '@/servidor/sesion';

// Every action checks the session itself: an action can be posted to directly.
// The user id comes from the session, never from the form.

export async function guardarProductoAccion(datos: DatosProducto): Promise<Resultado<{ id: string }>> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_PERMITIDO', 'Entrá a tu cuenta para guardar productos.');
  if (!sesion.negocio) return fallo('NO_PERMITIDO', 'Primero tenés que registrar tu negocio.');

  const r = await guardarProducto(sesion.usuario.id, datos);
  if (!r.ok) return r;

  // Leaves the form: a redirect ends the action, so nothing after it runs.
  redirect('/mi-negocio/productos?guardado=1');
}

export async function cambiarStockAccion(
  productoId: string,
  stock: number,
): Promise<Resultado<{ stock: number }>> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_PERMITIDO', 'Entrá a tu cuenta para cambiar el stock.');
  if (!sesion.negocio) return fallo('NO_PERMITIDO', 'Primero tenés que registrar tu negocio.');
  return cambiarStock(sesion.usuario.id, productoId, stock);
}

export async function cambiarActivoAccion(
  productoId: string,
  activo: boolean,
): Promise<Resultado<{ activo: boolean }>> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_PERMITIDO', 'Entrá a tu cuenta para cambiar el producto.');
  if (!sesion.negocio) return fallo('NO_PERMITIDO', 'Primero tenés que registrar tu negocio.');
  return cambiarActivo(sesion.usuario.id, productoId, activo);
}

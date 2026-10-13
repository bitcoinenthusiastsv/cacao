'use server';

import { redirect } from 'next/navigation';

import type { EstadoAccion } from '@/app/necesito/_comun/estado';
import { aceptarCotizacion, rechazarCotizacion, retirarCotizacion } from '@/servidor/cotizaciones';
import { sesionActual } from '@/servidor/sesion';

// Every action reads the session itself: an action can be posted to directly.
// The user id comes from the session; the quote id is only passed on, and the server checks it.

function texto(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor : '';
}

function fallo(mensaje: string): EstadoAccion {
  return { ok: false, mensaje };
}

export async function aceptarCotizacionAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('Entrá a tu cuenta para seguir.');

  const r = await aceptarCotizacion(sesion.usuario.id, texto(datos, 'cotizacionId'));
  if (!r.ok) return fallo(r.mensaje);

  // Leaves the page: the job is the next screen. A redirect ends the action.
  redirect(`/ordenes/${r.dato.ordenId}`);
}

export async function rechazarCotizacionAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('Entrá a tu cuenta para seguir.');

  const r = await rechazarCotizacion(sesion.usuario.id, texto(datos, 'cotizacionId'));
  if (!r.ok) return fallo(r.mensaje);
  return { ok: true, mensaje: 'Rechazaste la propuesta. Le avisamos a quien trabaja.' };
}

export async function retirarCotizacionAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('Entrá a tu cuenta para seguir.');

  const r = await retirarCotizacion(sesion.usuario.id, texto(datos, 'cotizacionId'));
  if (!r.ok) return fallo(r.mensaje);
  return { ok: true, mensaje: 'Retiraste tu oferta.' };
}

'use server';

import { redirect } from 'next/navigation';

import { precioDesdeTexto } from '@/lib/servicios';
import { ofertar } from '@/servidor/cotizaciones';
import { cancelarNecesidad, publicarNecesidad } from '@/servidor/necesidades';
import { sesionActual } from '@/servidor/sesion';

import type { EstadoAccion } from './_comun/estado';

// Every action reads the session itself: an action can be posted to directly.
// The user id comes from the session, never from the form.

function texto(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor : '';
}

function fallo(mensaje: string): EstadoAccion {
  return { ok: false, mensaje };
}

export async function publicarNecesidadAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('Entrá a tu cuenta para publicar.');

  // An empty budget means none. Anything else must read as a price.
  let presupuesto: number | null = null;
  const textoPresupuesto = texto(datos, 'presupuesto').trim();
  if (textoPresupuesto !== '') {
    presupuesto = precioDesdeTexto(textoPresupuesto);
    if (presupuesto === null) return fallo('Escribí el presupuesto en dólares, por ejemplo 25 o 25.50.');
  }

  // A category that is not a number becomes 0, which the server refuses.
  const r = await publicarNecesidad(sesion.usuario.id, {
    categoriaId: Number(texto(datos, 'categoria')),
    titulo: texto(datos, 'titulo'),
    descripcion: texto(datos, 'descripcion'),
    zona: texto(datos, 'zona'),
    presupuestoUsdCentavos: presupuesto,
  });
  if (!r.ok) return fallo(r.mensaje);

  // Leaves the form: the new need is the next screen.
  redirect(`/necesito/${r.dato.id}`);
}

export async function ofertarAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('Entrá a tu cuenta para ofertar.');

  const precio = precioDesdeTexto(texto(datos, 'precio'));
  if (precio === null) return fallo('Escribí el precio en dólares, por ejemplo 12 o 12.50.');

  const r = await ofertar(sesion.usuario.id, texto(datos, 'necesidadId'), {
    precioUsdCentavos: precio,
    mensaje: texto(datos, 'mensaje'),
  });
  if (!r.ok) return fallo(r.mensaje);
  return { ok: true, mensaje: 'Tu oferta quedó enviada.' };
}

export async function cancelarNecesidadAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('Entrá a tu cuenta para seguir.');

  const r = await cancelarNecesidad(sesion.usuario.id, texto(datos, 'necesidadId'));
  if (!r.ok) return fallo(r.mensaje);
  return { ok: true, mensaje: 'Cancelaste la necesidad.' };
}

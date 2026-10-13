'use server';

import { redirect } from 'next/navigation';

import { esUuid } from '@/lib/servicios';
import { solicitarCotizacion } from '@/servidor/cotizaciones';
import { sesionActual } from '@/servidor/sesion';
import { contratarServicio } from '@/servidor/servicios';

// Each action re-reads the session first. The server functions then check the rules and the
// state, so a direct request to these actions cannot do more than the page offers.
export type EstadoFormulario = { error: string | null };

const NO_ENCONTRADO = 'No encontramos ese servicio.';

function textoDe(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor : '';
}

// Signed-out visitors sign in first and come back to this service.
function entrarPara(servicioId: string): never {
  redirect(`/entrar?volver=${encodeURIComponent(`/servicios/${servicioId}`)}`);
}

export async function contratarAccion(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const servicioId = textoDe(datos, 'servicioId');
  if (!esUuid(servicioId)) return { error: NO_ENCONTRADO };

  const sesion = await sesionActual();
  if (!sesion) entrarPara(servicioId);

  const resultado = await contratarServicio(sesion.usuario.id, {
    servicioId,
    nota: textoDe(datos, 'nota'),
    clave: textoDe(datos, 'clave'),
  });
  if (!resultado.ok) return { error: resultado.mensaje };

  // Only after success: the job exists and the id is known.
  redirect(`/ordenes/${resultado.dato.ordenId}`);
}

export async function cotizarAccion(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const servicioId = textoDe(datos, 'servicioId');
  if (!esUuid(servicioId)) return { error: NO_ENCONTRADO };

  const sesion = await sesionActual();
  if (!sesion) entrarPara(servicioId);

  const resultado = await solicitarCotizacion(sesion.usuario.id, {
    servicioId,
    descripcion: textoDe(datos, 'descripcion'),
  });
  if (!resultado.ok) return { error: resultado.mensaje };

  redirect('/cotizaciones');
}

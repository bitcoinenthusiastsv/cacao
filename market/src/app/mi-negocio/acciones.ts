'use server';

import { revalidatePath } from 'next/cache';

import {
  actualizarNegocio,
  cambiarAbierto,
  miNegocio,
  solicitarNegocio,
  type DatosNegocio,
  type Negocio,
} from '@/servidor/cuentas';
import { exigirSesion } from '@/servidor/sesion';

export type EstadoNegocio = {
  valores: DatosNegocio;
  error?: string;
  mensaje?: string;
};

export type EstadoAbierto = {
  abierto: boolean;
  error?: string;
};

// The browser sends text only; the signed-in user's id always comes from the session.
function leerValores(datos: FormData): DatosNegocio {
  return {
    nombre: String(datos.get('nombre') ?? ''),
    descripcion: String(datos.get('descripcion') ?? ''),
    ubicacion: String(datos.get('ubicacion') ?? ''),
    lightningAddress: String(datos.get('lightningAddress') ?? ''),
  };
}

function aValores(negocio: Negocio): DatosNegocio {
  return {
    nombre: negocio.nombre,
    descripcion: negocio.descripcion,
    ubicacion: negocio.ubicacion,
    lightningAddress: negocio.lightningAddress,
  };
}

export async function solicitar(previo: EstadoNegocio, datos: FormData): Promise<EstadoNegocio> {
  const sesion = await exigirSesion('/mi-negocio');
  const valores = leerValores(datos);

  const resultado = await solicitarNegocio(sesion.usuario.id, valores);
  if (!resultado.ok) return { valores, error: resultado.mensaje };

  // The page changes to the review panel once the shop exists.
  revalidatePath('/mi-negocio', 'layout');
  return {
    valores: aValores(resultado.dato),
    mensaje: 'Recibimos tu solicitud. Un administrador la revisa antes de abrir tu negocio.',
  };
}

export async function actualizar(previo: EstadoNegocio, datos: FormData): Promise<EstadoNegocio> {
  const sesion = await exigirSesion('/mi-negocio');
  const valores = leerValores(datos);

  // The form does not carry the open switch: read the current value so saving keeps it.
  const actual = await miNegocio(sesion.usuario.id);
  if (!actual.ok) return { valores, error: actual.mensaje };
  if (!actual.dato) return { valores, error: 'No encontramos tu negocio.' };

  const resultado = await actualizarNegocio(sesion.usuario.id, { ...valores, abierto: actual.dato.abierto });
  if (!resultado.ok) return { valores, error: resultado.mensaje };

  revalidatePath('/mi-negocio', 'layout');
  return { valores: aValores(resultado.dato), mensaje: 'Guardamos los cambios.' };
}

export async function alternarAbierto(previo: EstadoAbierto, datos: FormData): Promise<EstadoAbierto> {
  const sesion = await exigirSesion('/mi-negocio');
  // The hidden field carries the value the switch will take.
  const abierto = datos.get('abierto') === 'true';

  const resultado = await cambiarAbierto(sesion.usuario.id, abierto);
  if (!resultado.ok) return { abierto: previo.abierto, error: resultado.mensaje };

  revalidatePath('/mi-negocio', 'layout');
  return { abierto: resultado.dato.abierto };
}

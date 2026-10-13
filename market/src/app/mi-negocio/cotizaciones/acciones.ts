'use server';

import { redirect } from 'next/navigation';

import { precioDesdeTexto } from '@/lib/servicios';
import { retirarCotizacion, responderCotizacion } from '@/servidor/cotizaciones';
import { sesionActual } from '@/servidor/sesion';

// Every action checks the session itself: an action can be posted to directly.
// The shop id and the user id come from the session, never from the form.

export type EstadoCotizacionAccion = { error?: string };

const MENSAJE_PRECIO =
  'Escribí un precio en dólares entre $0.01 y $10,000.00, con hasta dos decimales. Por ejemplo, 25.00.';

export async function responderCotizacionAccion(
  previo: EstadoCotizacionAccion,
  datos: { cotizacionId: string; precio: string; mensaje: string },
): Promise<EstadoCotizacionAccion> {
  const sesion = await sesionActual();
  if (!sesion) return { error: 'Entrá a tu cuenta para responder.' };
  if (!sesion.negocio) return { error: 'Primero tenés que registrar tu negocio.' };

  const precioUsdCentavos = precioDesdeTexto(datos.precio ?? '');
  if (precioUsdCentavos === null) return { error: MENSAJE_PRECIO };

  const resultado = await responderCotizacion(sesion.usuario.id, datos.cotizacionId, {
    precioUsdCentavos,
    mensaje: datos.mensaje,
  });
  if (!resultado.ok) return { error: resultado.mensaje };

  // Leaves the card: the quote moves to the list of offers, so the notice rides on the URL.
  redirect('/mi-negocio/cotizaciones?enviada=1');
}

export async function retirarCotizacionAccion(
  previo: EstadoCotizacionAccion,
  cotizacionId: string,
): Promise<EstadoCotizacionAccion> {
  const sesion = await sesionActual();
  if (!sesion) return { error: 'Entrá a tu cuenta para seguir.' };
  if (!sesion.negocio) return { error: 'Primero tenés que registrar tu negocio.' };

  const resultado = await retirarCotizacion(sesion.usuario.id, cotizacionId);
  if (!resultado.ok) return { error: resultado.mensaje };

  redirect('/mi-negocio/cotizaciones?retirada=1');
}

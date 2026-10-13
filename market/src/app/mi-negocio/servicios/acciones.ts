'use server';

import { redirect } from 'next/navigation';

import { esTipoPrecio, precioDesdeTexto } from '@/lib/servicios';
import { fallo, type Resultado } from '@/servidor/resultado';
import { sesionActual } from '@/servidor/sesion';
import { cambiarActivoServicio, guardarServicio, type DatosServicio } from '@/servidor/servicios';

import type { DatosFormularioServicio } from './_comun/tipos';

// Every action checks the session itself: an action can be posted to directly.
// The shop id comes from the session, never from the form.

export type EstadoServicio = { error?: string };

const MENSAJE_PRECIO =
  'Escribí un precio en dólares entre $0.01 y $10,000.00, con hasta dos decimales. Por ejemplo, 5.50.';

export async function guardarServicioAccion(
  previo: EstadoServicio,
  datos: DatosFormularioServicio,
): Promise<EstadoServicio> {
  const sesion = await sesionActual();
  if (!sesion) return { error: 'Entrá a tu cuenta para guardar servicios.' };
  if (!sesion.negocio) return { error: 'Primero tenés que registrar tu negocio.' };
  if (!esTipoPrecio(datos.tipoPrecio)) return { error: 'Elegí si el servicio tiene precio fijo o se cotiza.' };

  // A quoted service has no price: the field is hidden, so nothing is read here.
  let precioUsdCentavos: number | null = null;
  if (datos.tipoPrecio === 'fijo') {
    precioUsdCentavos = precioDesdeTexto(datos.precio ?? '');
    if (precioUsdCentavos === null) return { error: MENSAJE_PRECIO };
  }

  const servicio: DatosServicio = {
    id: datos.id,
    categoriaId: Number(datos.categoria),
    titulo: datos.titulo,
    descripcion: datos.descripcion,
    zona: datos.zona,
    tipoPrecio: datos.tipoPrecio,
    precioUsdCentavos,
    unidad: datos.tipoPrecio === 'fijo' ? datos.unidad : null,
    activo: datos.activo,
    fotos: datos.fotos,
  };

  const resultado = await guardarServicio(sesion.usuario.id, servicio);
  if (!resultado.ok) return { error: resultado.mensaje };

  // Leaves the form: a redirect ends the action, so nothing after it runs.
  redirect('/mi-negocio/servicios?guardado=1');
}

export async function cambiarActivoServicioAccion(
  servicioId: string,
  activo: boolean,
): Promise<Resultado<{ activo: boolean }>> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_PERMITIDO', 'Entrá a tu cuenta para cambiar el servicio.');
  if (!sesion.negocio) return fallo('NO_PERMITIDO', 'Primero tenés que registrar tu negocio.');
  return cambiarActivoServicio(sesion.usuario.id, servicioId, activo);
}

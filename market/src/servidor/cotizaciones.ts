import 'server-only';

import { revalidatePath } from 'next/cache';

import { cotizacionUsdBtc } from '@/lib/precio/fuente';
import { enteroEnLimite, type EstadoCotizacion, esUuid, LIMITES, textoEnLimite } from '@/lib/servicios';

import { registrarEvento, sesionDeVisitaCreando } from './eventos';
import { nombresDeUsuarios } from './necesidades';
import { desdeError, exito, fallo, type Resultado } from './resultado';
import { clienteServicio } from './supabase';

// A quote as its client and its shop both see it. A quote asked for a service has origen 'servicio';
// an offer on a need has origen 'necesidad'. The client's name is the first name only.
export type Cotizacion = {
  id: string;
  origen: 'servicio' | 'necesidad';
  servicioId: string | null;
  necesidadId: string | null;
  titulo: string;
  negocioId: string;
  negocioNombre: string;
  clienteNombre: string;
  /** What the client asked for. Empty for an offer on a need. */
  descripcion: string;
  precioUsdCentavos: number | null;
  mensaje: string;
  estado: EstadoCotizacion;
  /** The job, once the quote was accepted. */
  ordenId: string | null;
  creadaEn: string;
  respondidaEn: string | null;
};

/** One quote for the signed-in user, with the side they are on. */
export type CotizacionParaUsuario = Cotizacion & { rol: 'cliente' | 'vendedor' };

const MENSAJE_SESION = 'Entrá a tu cuenta para seguir.';
const MENSAJE_DATOS = 'Revisá los datos y probá de nuevo.';
const MENSAJE_PRECIO = 'El precio tiene que estar entre $0.01 y $10,000.00.';
const MENSAJE_MENSAJE = 'El mensaje no puede pasar de 600 caracteres.';
const MAXIMO_LISTA = 100;

const COLUMNAS =
  'id, negocio_id, cliente_id, servicio_id, necesidad_id, descripcion_cliente, precio_usd_centavos, mensaje, estado, orden_id, creada_en, respondida_en, negocios(nombre, usuario_id), servicios(titulo), necesidades(titulo)';

type FilaCotizacion = {
  id: string;
  negocio_id: string;
  cliente_id: string;
  servicio_id: string | null;
  necesidad_id: string | null;
  descripcion_cliente: string;
  precio_usd_centavos: number | null;
  mensaje: string;
  estado: EstadoCotizacion;
  orden_id: string | null;
  creada_en: string;
  respondida_en: string | null;
  negocios: { nombre: string; usuario_id: string } | null;
  servicios: { titulo: string } | null;
  necesidades: { titulo: string } | null;
};

// Revalidation outside a request (scripts, tests) has no cache to clear. The write has happened.
function revalidar(ruta: string): void {
  try {
    revalidatePath(ruta);
  } catch {
    // No cache to clear outside a request.
  }
}

async function aCotizaciones(filas: FilaCotizacion[]): Promise<Cotizacion[]> {
  const nombres = await nombresDeUsuarios(filas.map((f) => f.cliente_id));
  return filas.map((f) => ({
    id: f.id,
    origen: f.servicio_id ? 'servicio' : 'necesidad',
    servicioId: f.servicio_id,
    necesidadId: f.necesidad_id,
    titulo: f.servicios?.titulo ?? f.necesidades?.titulo ?? '',
    negocioId: f.negocio_id,
    negocioNombre: f.negocios?.nombre ?? '',
    clienteNombre: nombres.get(f.cliente_id) ?? '',
    descripcion: f.descripcion_cliente,
    precioUsdCentavos: f.precio_usd_centavos,
    mensaje: f.mensaje,
    estado: f.estado,
    ordenId: f.orden_id,
    creadaEn: f.creada_en,
    respondidaEn: f.respondida_en,
  }));
}

/** The quotes the user asked for, or received on their needs, newest first. */
export async function misCotizacionesComoCliente(usuarioId: string): Promise<Cotizacion[]> {
  if (!esUuid(usuarioId)) return [];

  const { data, error } = await clienteServicio()
    .from('cotizaciones')
    .select(COLUMNAS)
    .eq('cliente_id', usuarioId)
    .order('creada_en', { ascending: false })
    .limit(MAXIMO_LISTA);
  if (error) throw new Error(`No pudimos leer tus cotizaciones: ${error.message}`);
  return aCotizaciones((data ?? []) as unknown as FilaCotizacion[]);
}

/**
 * The shop's quotes: requests waiting for an answer first, then the rest, newest first.
 * The page passes the shop it got from the session.
 */
export async function cotizacionesDelNegocio(negocioId: string): Promise<Cotizacion[]> {
  if (!esUuid(negocioId)) return [];

  const { data, error } = await clienteServicio()
    .from('cotizaciones')
    .select(COLUMNAS)
    .eq('negocio_id', negocioId)
    .order('creada_en', { ascending: false })
    .limit(MAXIMO_LISTA);
  if (error) throw new Error(`No pudimos leer las cotizaciones: ${error.message}`);

  const todas = await aCotizaciones((data ?? []) as unknown as FilaCotizacion[]);
  const porResponder = todas.filter((c) => c.estado === 'solicitada');
  return [...porResponder, ...todas.filter((c) => c.estado !== 'solicitada')];
}

/** One quote, if the user is its client or owns its shop. Anyone else gets null. */
export async function cotizacionPara(usuario: { id: string }, cotizacionId: string): Promise<CotizacionParaUsuario | null> {
  if (!esUuid(usuario.id) || !esUuid(cotizacionId)) return null;

  const { data, error } = await clienteServicio()
    .from('cotizaciones')
    .select(COLUMNAS)
    .eq('id', cotizacionId)
    .maybeSingle();
  if (error) throw new Error(`No pudimos leer la cotización: ${error.message}`);
  if (!data) return null;

  const fila = data as unknown as FilaCotizacion;
  let rol: 'cliente' | 'vendedor' | null = null;
  if (fila.cliente_id === usuario.id) rol = 'cliente';
  else if (fila.negocios?.usuario_id === usuario.id) rol = 'vendedor';
  if (!rol) return null;

  const [cotizacion] = await aCotizaciones([fila]);
  return cotizacion ? { ...cotizacion, rol } : null;
}

/** A client asks a shop for a price on a service marked "cotizar". */
export async function solicitarCotizacion(
  usuarioId: string,
  datos: { servicioId: string; descripcion: string },
): Promise<Resultado<{ id: string }>> {
  try {
    if (!esUuid(usuarioId) || !esUuid(datos.servicioId)) return fallo('DATOS_INVALIDOS', MENSAJE_SESION);
    if (!textoEnLimite(datos.descripcion, LIMITES.descripcionTrabajo)) {
      return fallo('DATOS_INVALIDOS', 'La descripción del trabajo tiene que tener entre 10 y 1000 caracteres.');
    }

    const { data, error } = await clienteServicio().rpc('solicitar_cotizacion', {
      p_cliente: usuarioId,
      p_servicio: datos.servicioId,
      p_descripcion: datos.descripcion.trim(),
    });
    if (error) return desdeError(error);

    revalidar('/cotizaciones');
    revalidar('/mi-negocio/cotizaciones');
    return exito({ id: data.id });
  } catch (error) {
    return desdeError(error);
  }
}

/** The shop answers a request with a price and a message. */
export async function responderCotizacion(
  usuarioId: string,
  cotizacionId: string,
  datos: { precioUsdCentavos: number; mensaje: string },
): Promise<Resultado<{ id: string }>> {
  try {
    if (!esUuid(usuarioId) || !esUuid(cotizacionId)) return fallo('DATOS_INVALIDOS', MENSAJE_DATOS);
    if (!enteroEnLimite(datos.precioUsdCentavos, LIMITES.precioCentavos)) return fallo('DATOS_INVALIDOS', MENSAJE_PRECIO);
    if (!textoEnLimite(datos.mensaje, LIMITES.mensaje)) return fallo('DATOS_INVALIDOS', MENSAJE_MENSAJE);

    const { data, error } = await clienteServicio().rpc('responder_cotizacion', {
      p_cotizacion: cotizacionId,
      p_actor: usuarioId,
      p_precio: datos.precioUsdCentavos,
      p_mensaje: datos.mensaje.trim(),
    });
    if (error) return desdeError(error);

    revalidar('/cotizaciones');
    revalidar('/mi-negocio/cotizaciones');
    return exito({ id: data.id });
  } catch (error) {
    return desdeError(error);
  }
}

/** An approved shop offers a price on a need. A withdrawn offer is reused. */
export async function ofertar(
  usuarioId: string,
  necesidadId: string,
  datos: { precioUsdCentavos: number; mensaje: string },
): Promise<Resultado<{ id: string }>> {
  try {
    if (!esUuid(usuarioId) || !esUuid(necesidadId)) return fallo('DATOS_INVALIDOS', MENSAJE_DATOS);
    if (!enteroEnLimite(datos.precioUsdCentavos, LIMITES.precioCentavos)) return fallo('DATOS_INVALIDOS', MENSAJE_PRECIO);
    if (!textoEnLimite(datos.mensaje, LIMITES.mensaje)) return fallo('DATOS_INVALIDOS', MENSAJE_MENSAJE);

    const { data, error } = await clienteServicio().rpc('ofertar', {
      p_usuario: usuarioId,
      p_necesidad: necesidadId,
      p_precio: datos.precioUsdCentavos,
      p_mensaje: datos.mensaje.trim(),
    });
    if (error) return desdeError(error);

    revalidar(`/necesito/${necesidadId}`);
    revalidar('/necesito');
    revalidar('/cotizaciones');
    revalidar('/mi-negocio/cotizaciones');
    return exito({ id: data.id });
  } catch (error) {
    return desdeError(error);
  }
}

/** The shop takes its quote or offer back, while nobody has accepted it. */
export async function retirarCotizacion(usuarioId: string, cotizacionId: string): Promise<Resultado<{ id: string }>> {
  try {
    if (!esUuid(usuarioId) || !esUuid(cotizacionId)) return fallo('DATOS_INVALIDOS', MENSAJE_DATOS);

    const { data, error } = await clienteServicio().rpc('retirar_cotizacion', {
      p_cotizacion: cotizacionId,
      p_actor: usuarioId,
    });
    if (error) return desdeError(error);

    if (data.necesidad_id) revalidar(`/necesito/${data.necesidad_id}`);
    revalidar('/cotizaciones');
    revalidar('/mi-negocio/cotizaciones');
    return exito({ id: data.id });
  } catch (error) {
    return desdeError(error);
  }
}

/** The client turns a quote down. The shop hears about it. */
export async function rechazarCotizacion(usuarioId: string, cotizacionId: string): Promise<Resultado<{ id: string }>> {
  try {
    if (!esUuid(usuarioId) || !esUuid(cotizacionId)) return fallo('DATOS_INVALIDOS', MENSAJE_DATOS);

    const { data, error } = await clienteServicio().rpc('rechazar_cotizacion', {
      p_cotizacion: cotizacionId,
      p_actor: usuarioId,
    });
    if (error) return desdeError(error);

    if (data.necesidad_id) revalidar(`/necesito/${data.necesidad_id}`);
    revalidar('/cotizaciones');
    revalidar('/mi-negocio/cotizaciones');
    return exito({ id: data.id });
  } catch (error) {
    return desdeError(error);
  }
}

/**
 * The client accepts an offered quote. The job is born as 'acordada' at today's quote. Accepting
 * again returns the same job.
 */
export async function aceptarCotizacion(usuarioId: string, cotizacionId: string): Promise<Resultado<{ ordenId: string }>> {
  try {
    if (!esUuid(usuarioId) || !esUuid(cotizacionId)) return fallo('DATOS_INVALIDOS', MENSAJE_DATOS);

    let cotizacion: number;
    try {
      cotizacion = await cotizacionUsdBtc();
    } catch {
      return fallo('SIN_COTIZACION', 'No pudimos obtener el precio del bitcoin. Probá de nuevo en un momento.');
    }

    const { data, error } = await clienteServicio().rpc('aceptar_cotizacion', {
      p_cotizacion: cotizacionId,
      p_actor: usuarioId,
      p_cotizacion_btc: cotizacion,
    });
    if (error) return desdeError(error);

    await registrarEvento({
      nombre: 'acordo_trabajo',
      sesion: await sesionDeVisitaCreando(),
      usuarioId,
      ruta: '/cotizaciones',
      objeto: data.id,
      valorUsdCentavos: data.total_usd_centavos,
    });

    revalidar('/cotizaciones');
    revalidar('/mi-negocio/cotizaciones');
    revalidar('/necesito');
    return exito({ ordenId: data.id });
  } catch (error) {
    return desdeError(error);
  }
}

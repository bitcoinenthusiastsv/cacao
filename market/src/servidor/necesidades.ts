import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

import {
  diasRestantes,
  enteroEnLimite,
  esUuid,
  type EstadoCotizacion,
  type EstadoNecesidad,
  LIMITES,
  necesidadAbierta,
  primerNombre,
  textoEnLimite,
} from '@/lib/servicios';
import type { Database } from '@/tipos/db';

import { desdeError, exito, fallo, type Resultado } from './resultado';
import { clienteServicio, clienteSesion } from './supabase';

type Cliente = SupabaseClient<Database>;

// A need as the board and the author's list show it. The author's name is the first name only.
export type Necesidad = {
  id: string;
  titulo: string;
  descripcion: string;
  zona: string;
  presupuestoUsdCentavos: number | null;
  estado: EstadoNecesidad;
  categoriaId: number;
  categoriaNombre: string;
  autorNombre: string;
  creadaEn: string;
  venceEn: string;
  diasRestantes: number;
  /** Offers still waiting for the author: solicitada or ofrecida. */
  ofertasAbiertas: number;
};

export type OfertaNecesidad = {
  id: string;
  negocioId: string;
  negocioNombre: string;
  negocioPromedio: number | null;
  negocioResenas: number;
  precioUsdCentavos: number | null;
  mensaje: string;
  estado: EstadoCotizacion;
  creadaEn: string;
  respondidaEn: string | null;
};

export type NecesidadParaUsuario = {
  necesidad: Necesidad;
  esAutor: boolean;
  /** Every offer on the need. Only the author gets them; anyone else gets an empty list. */
  ofertas: OfertaNecesidad[];
  /** The visitor's own shop's offer on this need, if any. */
  miOferta: OfertaNecesidad | null;
  puedeOfertar: boolean;
  /** Spanish reason when puedeOfertar is false, for the screen. */
  motivoNoPuedeOfertar: string | null;
};

/** What the form sends. Prices are whole USD cents. Null budget means none. */
export type DatosNecesidad = {
  categoriaId: number;
  titulo: string;
  descripcion: string;
  zona: string;
  presupuestoUsdCentavos: number | null;
};

export type FiltroTablon = { categoriaId?: number };

const MENSAJE_SESION = 'Entrá a tu cuenta para seguir.';
const MENSAJE_DATOS = 'Revisá los datos y probá de nuevo.';
const MAXIMO_TABLON = 60;

// Session reads name their columns. The author's id is read here but never returned.
const COLUMNAS =
  'id, usuario_id, categoria_id, titulo, descripcion, zona, presupuesto_usd_centavos, estado, oculta, creada_en, vence_en, categorias_servicio(nombre)';

type FilaNecesidad = {
  id: string;
  usuario_id: string;
  categoria_id: number;
  titulo: string;
  descripcion: string;
  zona: string;
  presupuesto_usd_centavos: number | null;
  estado: EstadoNecesidad;
  oculta: boolean;
  creada_en: string;
  vence_en: string;
  categorias_servicio: { nombre: string } | null;
};

const COLUMNAS_OFERTA =
  'id, negocio_id, precio_usd_centavos, mensaje, estado, creada_en, respondida_en, negocios(nombre)';

type FilaOferta = {
  id: string;
  negocio_id: string;
  precio_usd_centavos: number | null;
  mensaje: string;
  estado: EstadoCotizacion;
  creada_en: string;
  respondida_en: string | null;
  negocios: { nombre: string } | null;
};

const ESTADOS_ABIERTOS: EstadoCotizacion[] = ['solicitada', 'ofrecida'];

// Revalidation outside a request (scripts, tests) has no cache to clear. The write has happened.
function revalidar(ruta: string): void {
  try {
    revalidatePath(ruta);
  } catch {
    // No cache to clear outside a request.
  }
}

function promedio(notas: number[]): number | null {
  if (notas.length === 0) return null;
  return Math.round((notas.reduce((suma, n) => suma + n, 0) / notas.length) * 10) / 10;
}

/**
 * First names of users, by id. Shared with cotizaciones.ts. A session cannot read other people's
 * names, so the server reads them and sends only the first word.
 */
export async function nombresDeUsuarios(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();

  const { data, error } = await clienteServicio().from('usuarios').select('id, nombre').in('id', unicos);
  if (error) throw new Error(`No pudimos leer los nombres: ${error.message}`);
  return new Map((data ?? []).map((u) => [u.id, primerNombre(u.nombre)]));
}

type Calificacion = { promedio: number | null; cantidad: number };

async function calificacionesDe(negocioIds: string[]): Promise<Map<string, Calificacion>> {
  const unicos = [...new Set(negocioIds)];
  const notasPorNegocio = new Map<string, number[]>();
  if (unicos.length > 0) {
    const { data, error } = await clienteServicio()
      .from('resenas')
      .select('negocio_id, puntuacion')
      .in('negocio_id', unicos);
    if (error) throw new Error(`No pudimos leer las reseñas: ${error.message}`);
    for (const r of data ?? []) {
      notasPorNegocio.set(r.negocio_id, [...(notasPorNegocio.get(r.negocio_id) ?? []), r.puntuacion]);
    }
  }
  return new Map(
    unicos.map((id) => {
      const notas = notasPorNegocio.get(id) ?? [];
      return [id, { promedio: promedio(notas), cantidad: notas.length }];
    }),
  );
}

async function ofertasAbiertasPor(necesidadIds: string[]): Promise<Map<string, number>> {
  const cuenta = new Map<string, number>();
  if (necesidadIds.length === 0) return cuenta;

  const { data, error } = await clienteServicio()
    .from('cotizaciones')
    .select('necesidad_id')
    .in('necesidad_id', necesidadIds)
    .in('estado', ESTADOS_ABIERTOS);
  if (error) throw new Error(`No pudimos contar las ofertas: ${error.message}`);
  for (const fila of data ?? []) {
    if (fila.necesidad_id) cuenta.set(fila.necesidad_id, (cuenta.get(fila.necesidad_id) ?? 0) + 1);
  }
  return cuenta;
}

async function aNecesidades(filas: FilaNecesidad[], ahora: Date): Promise<Necesidad[]> {
  if (filas.length === 0) return [];
  const [nombres, abiertas] = await Promise.all([
    nombresDeUsuarios(filas.map((f) => f.usuario_id)),
    ofertasAbiertasPor(filas.map((f) => f.id)),
  ]);
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    zona: f.zona,
    presupuestoUsdCentavos: f.presupuesto_usd_centavos,
    estado: f.estado,
    categoriaId: f.categoria_id,
    categoriaNombre: f.categorias_servicio?.nombre ?? '',
    autorNombre: nombres.get(f.usuario_id) ?? '',
    creadaEn: f.creada_en,
    venceEn: f.vence_en,
    diasRestantes: diasRestantes(f.vence_en, ahora),
    ofertasAbiertas: abiertas.get(f.id) ?? 0,
  }));
}

async function ofertasDe(necesidadId: string, negocioId?: string): Promise<OfertaNecesidad[]> {
  let consulta = clienteServicio().from('cotizaciones').select(COLUMNAS_OFERTA).eq('necesidad_id', necesidadId);
  if (negocioId) consulta = consulta.eq('negocio_id', negocioId);

  const { data, error } = await consulta.order('creada_en', { ascending: false });
  if (error) throw new Error(`No pudimos leer las ofertas: ${error.message}`);

  const filas = (data ?? []) as unknown as FilaOferta[];
  const calificaciones = await calificacionesDe(filas.map((f) => f.negocio_id));
  return filas.map((f) => {
    const cal = calificaciones.get(f.negocio_id);
    return {
      id: f.id,
      negocioId: f.negocio_id,
      negocioNombre: f.negocios?.nombre ?? '',
      negocioPromedio: cal?.promedio ?? null,
      negocioResenas: cal?.cantidad ?? 0,
      precioUsdCentavos: f.precio_usd_centavos,
      mensaje: f.mensaje,
      estado: f.estado,
      creadaEn: f.creada_en,
      respondidaEn: f.respondida_en,
    };
  });
}

async function negocioDelUsuario(usuarioId: string): Promise<{ id: string; estado: string } | null> {
  const { data, error } = await clienteServicio()
    .from('negocios')
    .select('id, estado')
    .eq('usuario_id', usuarioId)
    .maybeSingle();
  if (error) throw new Error(`No pudimos leer tu negocio: ${error.message}`);
  return data;
}

/** Open needs, newest first, at most 60. Hidden and expired ones never appear. */
export async function tablon(filtro: FiltroTablon = {}): Promise<Necesidad[]> {
  return leerTablon(await clienteSesion(), filtro);
}

export async function leerTablon(db: Cliente, filtro: FiltroTablon = {}): Promise<Necesidad[]> {
  if (filtro.categoriaId !== undefined && !enteroEnLimite(filtro.categoriaId, LIMITES.categoria)) return [];

  const ahora = new Date();
  let consulta = db
    .from('necesidades')
    .select(COLUMNAS)
    .eq('estado', 'abierta')
    .eq('oculta', false)
    .gt('vence_en', ahora.toISOString());
  if (filtro.categoriaId !== undefined) consulta = consulta.eq('categoria_id', filtro.categoriaId);

  const { data, error } = await consulta.order('creada_en', { ascending: false }).limit(MAXIMO_TABLON);
  if (error) throw new Error(`No pudimos leer el tablón: ${error.message}`);
  return aNecesidades((data ?? []) as unknown as FilaNecesidad[], ahora);
}

export async function necesidadPublica(id: string): Promise<Necesidad | null> {
  return leerNecesidadPublica(await clienteSesion(), id);
}

/** One open, visible need, or null. */
export async function leerNecesidadPublica(db: Cliente, id: string): Promise<Necesidad | null> {
  if (!esUuid(id)) return null;

  const ahora = new Date();
  const { data, error } = await db
    .from('necesidades')
    .select(COLUMNAS)
    .eq('id', id)
    .eq('estado', 'abierta')
    .eq('oculta', false)
    .gt('vence_en', ahora.toISOString())
    .maybeSingle();
  if (error) throw new Error(`No pudimos leer la necesidad: ${error.message}`);
  if (!data) return null;

  const [necesidad] = await aNecesidades([data as unknown as FilaNecesidad], ahora);
  return necesidad ?? null;
}

/**
 * What /necesito/[id] shows a signed-in visitor. The author sees the need in any state and every offer.
 * A shop with an approved account sees its own offer and whether it may offer. Anyone else sees the need
 * only while it is open, and nothing more. Hidden needs are never shown to anyone but the author.
 */
export async function necesidadParaUsuario(
  necesidadId: string,
  usuario: { id: string },
): Promise<NecesidadParaUsuario | null> {
  if (!esUuid(necesidadId) || !esUuid(usuario.id)) return null;

  const ahora = new Date();
  const { data, error } = await clienteServicio()
    .from('necesidades')
    .select(COLUMNAS)
    .eq('id', necesidadId)
    .maybeSingle();
  if (error) throw new Error(`No pudimos leer la necesidad: ${error.message}`);
  if (!data) return null;

  const fila = data as unknown as FilaNecesidad;
  const esAutor = fila.usuario_id === usuario.id;
  if (!esAutor && fila.oculta) return null;

  const abierta = necesidadAbierta({ estado: fila.estado, oculta: fila.oculta, venceEn: fila.vence_en }, ahora);
  const negocio = await negocioDelUsuario(usuario.id);
  const aprobado = negocio?.estado === 'aprobado';

  // Only an approved shop reads its own offer. The need stays visible after it closes, so the shop
  // still sees how its offer ended.
  let miOferta: OfertaNecesidad | null = null;
  if (!esAutor && aprobado && negocio) {
    const propias = await ofertasDe(necesidadId, negocio.id);
    miOferta = propias[0] ?? null;
  }
  if (!esAutor && !abierta && miOferta === null) return null;

  const [necesidad] = await aNecesidades([fila], ahora);
  if (!necesidad) return null;
  const ofertas = esAutor ? await ofertasDe(necesidadId) : [];

  let motivo: string | null = null;
  if (esAutor) motivo = 'No podés ofertar en tu propia necesidad.';
  else if (!aprobado) motivo = 'Solo los negocios aprobados pueden ofertar.';
  else if (!abierta) motivo = 'Esa necesidad ya no recibe ofertas.';
  else if (miOferta?.estado === 'ofrecida') {
    motivo = 'Ya ofertaste en esta necesidad. Podés retirar tu oferta para cambiarla.';
  } else if (miOferta && miOferta.estado !== 'retirada') motivo = 'Ya no podés ofertar en esta necesidad.';

  return {
    necesidad,
    esAutor,
    ofertas,
    miOferta: esAutor ? null : miOferta,
    puedeOfertar: motivo === null,
    motivoNoPuedeOfertar: motivo,
  };
}

/** The author's needs in every state, newest first, with the open offers on each. */
export async function misNecesidades(usuarioId: string): Promise<Necesidad[]> {
  if (!esUuid(usuarioId)) return [];

  const { data, error } = await clienteServicio()
    .from('necesidades')
    .select(COLUMNAS)
    .eq('usuario_id', usuarioId)
    .order('creada_en', { ascending: false })
    .limit(100);
  if (error) throw new Error(`No pudimos leer tus necesidades: ${error.message}`);
  return aNecesidades((data ?? []) as unknown as FilaNecesidad[], new Date());
}

function validarDatos(datos: DatosNecesidad): Resultado<{
  categoria: number;
  titulo: string;
  descripcion: string;
  zona: string;
  presupuesto: number | null;
}> {
  if (typeof datos !== 'object' || datos === null) return fallo('DATOS_INVALIDOS', MENSAJE_DATOS);
  if (!enteroEnLimite(datos.categoriaId, LIMITES.categoria)) {
    return fallo('DATOS_INVALIDOS', 'Elegí una categoría válida.');
  }
  if (!textoEnLimite(datos.titulo, LIMITES.tituloNecesidad)) {
    return fallo('DATOS_INVALIDOS', 'El título tiene que tener entre 4 y 100 caracteres.');
  }
  if (!textoEnLimite(datos.descripcion, LIMITES.descripcionNecesidad)) {
    return fallo('DATOS_INVALIDOS', 'La descripción no puede pasar de 1000 caracteres.');
  }
  if (!textoEnLimite(datos.zona, LIMITES.zona)) {
    return fallo('DATOS_INVALIDOS', 'La zona no puede pasar de 160 caracteres.');
  }
  let presupuesto: number | null = null;
  if (datos.presupuestoUsdCentavos !== null) {
    if (!enteroEnLimite(datos.presupuestoUsdCentavos, LIMITES.presupuestoCentavos)) {
      return fallo('DATOS_INVALIDOS', 'El presupuesto tiene que estar entre $0.01 y $10,000.00.');
    }
    presupuesto = datos.presupuestoUsdCentavos;
  }
  return exito({
    categoria: datos.categoriaId,
    titulo: datos.titulo.trim(),
    descripcion: datos.descripcion.trim(),
    zona: datos.zona.trim(),
    presupuesto,
  });
}

/** Posts a need on the board. Any account can post one. */
export async function publicarNecesidad(usuarioId: string, datos: DatosNecesidad): Promise<Resultado<{ id: string }>> {
  try {
    if (!esUuid(usuarioId)) return fallo('DATOS_INVALIDOS', MENSAJE_SESION);
    const campos = validarDatos(datos);
    if (!campos.ok) return campos;

    const { data, error } = await clienteServicio().rpc('publicar_necesidad', {
      p_usuario: usuarioId,
      p_categoria: campos.dato.categoria,
      p_titulo: campos.dato.titulo,
      p_descripcion: campos.dato.descripcion,
      p_zona: campos.dato.zona,
      p_presupuesto: campos.dato.presupuesto as unknown as number,
    });
    if (error) return desdeError(error);

    revalidar('/necesito');
    return exito({ id: data.id });
  } catch (error) {
    return desdeError(error);
  }
}

/** The author cancels an open need. Its open offers are closed. */
export async function cancelarNecesidad(usuarioId: string, necesidadId: string): Promise<Resultado<{ id: string }>> {
  try {
    if (!esUuid(usuarioId) || !esUuid(necesidadId)) return fallo('DATOS_INVALIDOS', MENSAJE_DATOS);

    const { data, error } = await clienteServicio().rpc('cancelar_necesidad', {
      p_necesidad: necesidadId,
      p_usuario: usuarioId,
    });
    if (error) return desdeError(error);

    revalidar('/necesito');
    revalidar(`/necesito/${necesidadId}`);
    revalidar('/cotizaciones');
    revalidar('/mi-negocio/cotizaciones');
    return exito({ id: data.id });
  } catch (error) {
    return desdeError(error);
  }
}

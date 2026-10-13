import 'server-only';

import type { Aviso } from '@/app/ordenes/tipos';

import { esUuid } from './pedidos';
import { desdeError, exito, fallo, type Resultado } from './resultado';
import { clienteServicio, clienteSesion } from './supabase';

/** The newest unread notices of the user, newest first. */
export async function misAvisos(usuarioId: string, limite: number): Promise<Aviso[]> {
  if (!esUuid(usuarioId)) return [];
  const tope = Math.min(Math.max(Math.trunc(limite), 1), 50);
  const db = await clienteSesion();
  const { data, error } = await db
    .from('avisos')
    .select('id, orden_id, ruta, texto, creado_en')
    .eq('usuario_id', usuarioId)
    .eq('leido', false)
    .order('creado_en', { ascending: false })
    .limit(tope);
  if (error) throw new Error(`No pudimos leer los avisos: ${error.message}`);
  return (data ?? []).map((f) => ({
    id: f.id,
    texto: f.texto,
    ordenId: f.orden_id,
    // Notices about a quote or an offer carry their own page; order notices open the order.
    ruta: f.ruta ?? (f.orden_id ? `/ordenes/${f.orden_id}` : '/'),
    creadoEn: f.creado_en,
  }));
}

/** Unread notice count for the bottom bar. A read error counts as zero, so the page still renders. */
export async function contarNoLeidos(usuarioId: string): Promise<number> {
  if (!esUuid(usuarioId)) return 0;
  const db = await clienteSesion();
  const { count, error } = await db
    .from('avisos')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('leido', false);
  if (error) {
    console.error('contar avisos:', error.message);
    return 0;
  }
  return count ?? 0;
}

/** Marks every notice of the user as read. Returns how many changed. */
export async function marcarLeidos(usuarioId: string): Promise<Resultado<number>> {
  if (!esUuid(usuarioId)) return fallo('NO_ENCONTRADA', 'No encontramos tu cuenta.');
  const { data, error } = await clienteServicio().rpc('marcar_avisos_leidos', { p_usuario: usuarioId });
  if (error) return desdeError(error);
  return exito(data ?? 0);
}

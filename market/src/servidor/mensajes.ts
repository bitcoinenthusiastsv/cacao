import 'server-only';

import type { Mensaje } from '@/app/ordenes/tipos';

import { accesoAOrden, esUuid, largo } from './pedidos';
import { desdeError, exito, fallo, type Resultado } from './resultado';
import type { Sesion } from './sesion';
import { clienteServicio, clienteSesion } from './supabase';

type FilaMensaje = { id: string; autor_id: string; texto: string; creado_en: string };

function aMensaje(fila: FilaMensaje): Mensaje {
  return { id: fila.id, autorId: fila.autor_id, texto: fila.texto, creadoEn: fila.creado_en };
}

/** The last 200 messages of an order, oldest first. Null when the viewer is not a party. */
export async function mensajesDe(ordenId: string, sesion: Sesion): Promise<Mensaje[] | null> {
  const rol = await accesoAOrden(ordenId, sesion);
  if (!rol) return null;
  const db = await clienteSesion();
  const { data, error } = await db
    .from('mensajes')
    .select('id, autor_id, texto, creado_en')
    .eq('orden_id', ordenId)
    .order('creado_en', { ascending: false })
    .limit(200);
  if (error) throw new Error(`No pudimos leer los mensajes: ${error.message}`);
  return (data ?? []).reverse().map(aMensaje);
}

/** Sends one message. The database checks that the user is a party to the order. */
export async function enviarMensaje(
  ordenId: string,
  usuarioId: string,
  texto: string,
): Promise<Resultado<Mensaje>> {
  if (!esUuid(ordenId) || !esUuid(usuarioId)) {
    return fallo('NO_ENCONTRADA', 'No encontramos esa orden.');
  }
  const limpio = texto.trim();
  if (largo(limpio) < 1 || largo(limpio) > 1000) {
    return fallo('DATOS_INVALIDOS', 'El mensaje tiene que tener entre 1 y 1000 caracteres.');
  }

  // An expired order keeps its chat readable but closed. The buttons already hide the composer;
  // this check stops a direct request too.
  const db = await clienteSesion();
  const { data: orden, error: errorOrden } = await db
    .from('ordenes')
    .select('estado')
    .eq('id', ordenId)
    .maybeSingle();
  if (errorOrden) return desdeError(errorOrden);
  if (!orden) return fallo('NO_ENCONTRADA', 'No encontramos esa orden.');
  if (orden.estado === 'expirada') {
    return fallo('ESTADO_INVALIDO', 'La orden expiró y el chat quedó en solo lectura.');
  }

  const { data, error } = await clienteServicio().rpc('enviar_mensaje', {
    p_orden: ordenId,
    p_actor: usuarioId,
    p_texto: limpio,
  });
  if (error) return desdeError(error);
  return exito(aMensaje(data as unknown as FilaMensaje));
}

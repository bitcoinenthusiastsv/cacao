'use server';

import { revalidatePath } from 'next/cache';

import type { AccionEnvio } from '@/lib/transferencias';
import type { Resultado } from '@/servidor/resultado';
import { exigirAdmin } from '@/servidor/sesion';
import { procesarEnvio, simularCompletar, simularFallar, type CambioEnvio } from '@/servidor/transferencias';

export type EstadoAccion = { ok?: boolean; mensaje?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCIONES_ADMIN: AccionEnvio[] = ['procesar', 'completar', 'fallar'];

const LISTO: Record<'procesar' | 'completar' | 'fallar', string> = {
  procesar: 'Listo: el envío va en camino.',
  completar: 'Listo: el envío quedó como entregado.',
  fallar: 'Listo: el envío quedó como fallido.',
};

// One action for the three buttons. The server layer checks the state and the administrator flag
// again, so a stale page cannot move a transfer twice.
export async function ejecutarAccion(previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await exigirAdmin('/monitor/envios');
  const envioId = String(datos.get('envio') ?? '');
  const accion = String(datos.get('accion') ?? '') as AccionEnvio;
  if (!UUID.test(envioId) || !ACCIONES_ADMIN.includes(accion)) {
    return { ok: false, mensaje: 'No pudimos hacer esa acción. Recargá la página y probá de nuevo.' };
  }

  const actor = { id: sesion.usuario.id, esAdmin: true };
  let resultado: Resultado<CambioEnvio>;
  if (accion === 'procesar') {
    resultado = await procesarEnvio(actor.id, envioId);
  } else if (accion === 'completar') {
    resultado = await simularCompletar(actor, envioId);
  } else {
    resultado = await simularFallar(actor, envioId, String(datos.get('motivo') ?? ''));
  }

  if (!resultado.ok) return { ok: false, mensaje: resultado.mensaje };
  // The list, the detail and the summary all show the state, so every monitor page is read again.
  revalidatePath('/monitor', 'layout');
  return { ok: true, mensaje: LISTO[accion as 'procesar' | 'completar' | 'fallar'] };
}

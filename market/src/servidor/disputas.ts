import 'server-only';

import { esUuid, ejecutarRpc, largo } from './pedidos';
import { fallo, type Resultado } from './resultado';
import { clienteServicio } from './supabase';

const NO_ENCONTRADA = () => fallo('NO_ENCONTRADA', 'No encontramos esa orden.');

/** The buyer opens a dispute. The database checks the state and the 48 h window. */
export async function abrirDisputa(
  ordenId: string,
  usuarioId: string,
  motivo: string,
  evidencia: string,
): Promise<Resultado<null>> {
  if (!esUuid(ordenId) || !esUuid(usuarioId)) return NO_ENCONTRADA();
  const textoMotivo = motivo.trim();
  const textoEvidencia = evidencia.trim();
  if (largo(textoMotivo) < 10 || largo(textoMotivo) > 1000) {
    return fallo('DATOS_INVALIDOS', 'El motivo tiene que tener entre 10 y 1000 caracteres.');
  }
  // Stricter than the database (2000), as the brief asks for this screen.
  if (largo(textoEvidencia) > 1000) {
    return fallo('DATOS_INVALIDOS', 'La evidencia no puede pasar de 1000 caracteres.');
  }
  return ejecutarRpc(
    clienteServicio().rpc('abrir_disputa', {
      p_orden: ordenId,
      p_actor: usuarioId,
      p_motivo: textoMotivo,
      p_evidencia: textoEvidencia,
    }),
  );
}

/** The seller marks a refund paid outside the app. The app never holds the money. */
export async function marcarReembolso(ordenId: string, usuarioId: string): Promise<Resultado<null>> {
  if (!esUuid(ordenId) || !esUuid(usuarioId)) return NO_ENCONTRADA();
  return ejecutarRpc(clienteServicio().rpc('marcar_reembolso', { p_orden: ordenId, p_actor: usuarioId }));
}

/** The buyer confirms they received the refund the seller marked. */
export async function confirmarReembolso(ordenId: string, usuarioId: string): Promise<Resultado<null>> {
  if (!esUuid(ordenId) || !esUuid(usuarioId)) return NO_ENCONTRADA();
  return ejecutarRpc(
    clienteServicio().rpc('confirmar_reembolso', { p_orden: ordenId, p_actor: usuarioId }),
  );
}

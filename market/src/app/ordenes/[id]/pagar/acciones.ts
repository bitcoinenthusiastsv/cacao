'use server';

// Entry points the payment screen calls. Each reads the session itself; the buyer check
// happens in src/servidor/pagos.ts.

import { estadoDePago, reiniciarCobro, reintentarCobro, simularPago } from '@/servidor/pagos';
import { fallo, type Resultado } from '@/servidor/resultado';
import { sesionActual } from '@/servidor/sesion';

import type { EstadoPago } from './tipos';

const MENSAJE_NO_ENCONTRADA = 'No encontramos esa orden.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function estadoDePagoAccion(ordenId: string): Promise<Resultado<EstadoPago>> {
  if (!UUID.test(ordenId)) return fallo('NO_ENCONTRADA', MENSAJE_NO_ENCONTRADA);
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_ENCONTRADA', MENSAJE_NO_ENCONTRADA);
  return estadoDePago(ordenId, sesion.usuario.id);
}

export async function reintentarCobroAccion(ordenId: string): Promise<Resultado<EstadoPago>> {
  if (!UUID.test(ordenId)) return fallo('NO_ENCONTRADA', MENSAJE_NO_ENCONTRADA);
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_ENCONTRADA', MENSAJE_NO_ENCONTRADA);
  return reintentarCobro(ordenId, sesion.usuario.id);
}

// "Generar otra solicitud" for a job: its lapsed request is replaced by a new one, at today's quote.
export async function reiniciarCobroAccion(ordenId: string): Promise<Resultado<EstadoPago>> {
  if (!UUID.test(ordenId)) return fallo('NO_ENCONTRADA', MENSAJE_NO_ENCONTRADA);
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_ENCONTRADA', MENSAJE_NO_ENCONTRADA);
  return reiniciarCobro(ordenId, sesion.usuario.id);
}

export async function simularPagoAccion(ordenId: string): Promise<Resultado<null>> {
  if (!UUID.test(ordenId)) return fallo('NO_ENCONTRADA', MENSAJE_NO_ENCONTRADA);
  const sesion = await sesionActual();
  if (!sesion) return fallo('NO_ENCONTRADA', MENSAJE_NO_ENCONTRADA);
  return simularPago(ordenId, sesion.usuario.id);
}

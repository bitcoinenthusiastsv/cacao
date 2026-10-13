'use server';

// Entry points the cart screen calls. Each reads the session itself, then calls src/servidor.

import { crearPedido, revisarCarrito as revisarCarritoServidor } from '@/servidor/ordenes';
import { fallo, type Resultado } from '@/servidor/resultado';
import { sesionActual } from '@/servidor/sesion';

import type { RevisionCarrito } from './tipos';

export async function revisarCarrito(lineas: unknown): Promise<Resultado<RevisionCarrito>> {
  return revisarCarritoServidor(lineas);
}

export async function hacerPedido(entrada: unknown): Promise<Resultado<{ ordenId: string }>> {
  const sesion = await sesionActual();
  if (!sesion) return fallo('SIN_SESION', 'Entrá para hacer el pedido.');
  return crearPedido(sesion.usuario.id, entrada);
}

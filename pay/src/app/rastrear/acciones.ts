'use server';

import { redirect } from 'next/navigation';

import { esCodigo, normalizarCodigo } from '@/lib/transferencias';

export type EstadoBusqueda = { codigo: string; error?: string };

// Only the code goes into the address. It is meant to be shared, and it holds no personal data.
export async function buscarEnvio(previo: EstadoBusqueda, datos: FormData): Promise<EstadoBusqueda> {
  const tecleado = String(datos.get('codigo') ?? '').trim();
  if (tecleado === '') {
    return { codigo: '', error: 'Escribí el código del envío. Se ve así: CP-7F3K-92QD.' };
  }
  if (!esCodigo(tecleado)) {
    return {
      codigo: tecleado,
      error: 'Ese código no es válido. Revisalo: se ve así, CP-7F3K-92QD.',
    };
  }
  redirect(`/t/${normalizarCodigo(tecleado)}`);
}

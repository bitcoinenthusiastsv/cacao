'use client';

import { useState, useTransition } from 'react';

import type { Resultado } from '@/servidor/resultado';

// Runs one server action with a pending flag and the Spanish error from the database.
// A success refreshes the page data through the action's revalidation.
export function useAccion() {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function correr(operacion: () => Promise<Resultado<unknown>>, alExito?: () => void) {
    setError(null);
    empezar(async () => {
      const resultado = await operacion();
      if (resultado.ok) {
        alExito?.();
      } else {
        setError(resultado.mensaje);
      }
    });
  }

  return { pendiente, error, correr };
}

'use client';

import { useState, useTransition } from 'react';

import { cambiarActivoServicioAccion } from '../acciones';
import estilos from '../estilos.module.css';

type Props = {
  id: string;
  titulo: string;
  activo: boolean;
  /** False when the shop is not approved: the database would refuse the change, so the button is off. */
  puedeCambiar: boolean;
  /** Says why the button is off, for people who cannot see the notice at the top. */
  motivoId: string | null;
};

// Pause or activate one service from the list. The list shows what the database kept.
export function ControlesServicio({ id, titulo, activo, puedeCambiar, motivoId }: Props) {
  const [pendiente, transicion] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function alternar() {
    setError(null);
    transicion(async () => {
      const r = await cambiarActivoServicioAccion(id, !activo);
      if (!r.ok) setError(r.mensaje);
    });
  }

  return (
    <div className={estilos.controles}>
      <button
        type="button"
        className={`boton boton--secundario ${estilos.controlesBoton}`}
        onClick={alternar}
        disabled={pendiente || !puedeCambiar}
        aria-describedby={motivoId ?? undefined}
        aria-label={`${activo ? 'Pausar' : 'Activar'} ${titulo}`}
      >
        {activo ? 'Pausar' : 'Activar'}
      </button>

      <p role="status" aria-live="polite" className={estilos.ayuda}>
        {pendiente ? 'Guardando…' : ''}
      </p>
      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

'use client';

import { startTransition, useActionState, useState } from 'react';

import { retirarCotizacionAccion, type EstadoCotizacionAccion } from '../acciones';
import estilos from '../estilos.module.css';

const ESTADO_INICIAL: EstadoCotizacionAccion = {};

type Props = {
  cotizacionId: string;
  /** The button label, for example "No puedo hacerlo" or "Retirar oferta". */
  etiqueta: string;
};

// Withdrawing is one step too many to do by accident, so the first press only asks.
export function RetirarCotizacion({ cotizacionId, etiqueta }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, despachar, pendiente] = useActionState(retirarCotizacionAccion, ESTADO_INICIAL);

  if (!confirmando) {
    return (
      <div className={estilos.retirar}>
        <button
          type="button"
          className={`boton boton--secundario ${estilos.botonSecundario}`}
          onClick={() => setConfirmando(true)}
        >
          {etiqueta}
        </button>
        {estado.error && (
          <p className={estilos.error} role="alert">
            {estado.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={estilos.retirar} role="group" aria-label={`Confirmar: ${etiqueta.toLowerCase()}`}>
      <p className={estilos.ayuda}>¿Seguro? La cotización queda retirada y el cliente lo ve.</p>
      <div className={estilos.acciones}>
        <button
          type="button"
          className="boton"
          disabled={pendiente}
          aria-busy={pendiente}
          onClick={() => startTransition(() => despachar(cotizacionId))}
        >
          {pendiente ? 'Retirando…' : `Sí, ${etiqueta.toLowerCase()}`}
        </button>
        <button
          type="button"
          className="boton boton--secundario"
          disabled={pendiente}
          onClick={() => setConfirmando(false)}
        >
          Volver
        </button>
      </div>
      {estado.error && (
        <p className={estilos.error} role="alert">
          {estado.error}
        </p>
      )}
    </div>
  );
}

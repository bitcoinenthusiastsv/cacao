'use client';

import { useState, useTransition } from 'react';

import { marcarAvisosLeidos } from './acciones';
import styles from './ordenes.module.css';

export function BotonMarcarLeidos() {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function marcar() {
    setError(null);
    empezar(async () => {
      const resultado = await marcarAvisosLeidos();
      if (!resultado.ok) setError(resultado.mensaje);
    });
  }

  return (
    <div className={styles.grupo}>
      <button type="button" className="boton boton--secundario" onClick={marcar} disabled={pendiente}>
        {pendiente ? 'Marcando…' : 'Marcar como leídos'}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

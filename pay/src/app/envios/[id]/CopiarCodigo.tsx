'use client';

import { useState } from 'react';

type Estado = 'listo' | 'copiado' | 'fallo';

/** Copies the transfer code to the clipboard and says so in a status line. */
export function CopiarCodigo({ codigo }: { codigo: string }) {
  const [estado, setEstado] = useState<Estado>('listo');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setEstado('copiado');
    } catch {
      setEstado('fallo');
    }
  }

  return (
    <div>
      <button type="button" className="boton boton--secundario" onClick={copiar}>
        Copiar código
      </button>
      <p role="status" aria-live="polite" className="aviso">
        {estado === 'copiado' && 'Código copiado.'}
        {estado === 'fallo' && 'No pudimos copiarlo. Seleccionalo a mano.'}
      </p>
    </div>
  );
}

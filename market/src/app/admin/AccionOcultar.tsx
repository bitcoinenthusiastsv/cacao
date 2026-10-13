'use client';

import { useState } from 'react';

import { BotonEnvio } from './BotonEnvio';
import estilos from './estilos.module.css';

// Hides a listing after a confirm step, or shows it again at once. Shared by services and needs.
export function AccionOcultar({
  id,
  campo,
  titulo,
  oculto,
  accion,
}: {
  id: string;
  campo: 'oculto' | 'oculta';
  titulo: string;
  oculto: boolean;
  accion: (datos: FormData) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (oculto) {
    return (
      <form action={accion} onSubmit={() => setConfirmando(false)} className={estilos.formulario}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name={campo} value="no" />
        <div className={estilos.acciones}>
          <BotonEnvio pendiente="Mostrando…" variante="secundario">
            Volver a mostrar
          </BotonEnvio>
        </div>
      </form>
    );
  }

  if (!confirmando) {
    return (
      <div className={estilos.acciones}>
        <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(true)}>
          Ocultar
        </button>
      </div>
    );
  }

  return (
    <form action={accion} className={estilos.confirmacion}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name={campo} value="si" />
      <p>
        Confirmá que querés ocultar «{titulo}». Dejará de verse para todos, menos para quien la publicó.
      </p>
      <div className={estilos.acciones}>
        <BotonEnvio pendiente="Ocultando…">Confirmar ocultar</BotonEnvio>
        <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

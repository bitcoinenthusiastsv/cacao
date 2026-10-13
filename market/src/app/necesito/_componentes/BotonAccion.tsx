'use client';

import { useActionState, useState } from 'react';

import { ESTADO_INICIAL, type EstadoAccion } from '../_comun/estado';
import estilos from '../estilos.module.css';

type Props = {
  accion: (previo: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  /** Hidden fields sent with the action: only ids the server will check again. */
  campos: Record<string, string>;
  etiqueta: string;
  variante?: 'primario' | 'secundario';
  /** Irreversible actions: the first button only asks, the second one sends. */
  confirmacion?: { texto: string; etiquetaConfirmar: string };
  /**
   * False once the action no longer applies. The component stays mounted, so the sentence the last
   * action returned stays on screen after the page refreshes; only the button goes.
   */
  disponible?: boolean;
};

export function BotonAccion({
  accion,
  campos,
  etiqueta,
  variante = 'primario',
  confirmacion,
  disponible = true,
}: Props) {
  const [estado, formAccion, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const [preguntando, setPreguntando] = useState(false);
  const clase = variante === 'secundario' ? 'boton boton--secundario' : 'boton';

  const mensaje = estado.mensaje && (
    <p role={estado.ok ? 'status' : 'alert'} className={estado.ok ? estilos.ok : estilos.error}>
      {estado.mensaje}
    </p>
  );

  if (!disponible) return <div className={estilos.bloque}>{mensaje}</div>;

  return (
    <div className={estilos.bloque}>
      <form action={formAccion} className={estilos.bloque}>
        {Object.entries(campos).map(([nombre, valor]) => (
          <input key={nombre} type="hidden" name={nombre} value={valor} />
        ))}

        {confirmacion && preguntando ? (
          <>
            <p>{confirmacion.texto}</p>
            <div className={estilos.botones}>
              <button type="submit" className="boton" disabled={pendiente}>
                {pendiente ? 'Enviando…' : confirmacion.etiquetaConfirmar}
              </button>
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => setPreguntando(false)}
                disabled={pendiente}
              >
                Volver
              </button>
            </div>
          </>
        ) : confirmacion ? (
          <button type="button" className={clase} onClick={() => setPreguntando(true)}>
            {etiqueta}
          </button>
        ) : (
          <button type="submit" className={clase} disabled={pendiente}>
            {pendiente ? 'Enviando…' : etiqueta}
          </button>
        )}
      </form>

      {mensaje}
    </div>
  );
}

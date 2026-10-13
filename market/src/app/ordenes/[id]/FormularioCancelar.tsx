'use client';

import { useState } from 'react';

import { cancelarTrabajo } from './acciones';
import styles from './orden.module.css';
import { useAccion } from './useAccion';

// The database checks the same limits; the form shows them before a round trip.
const MINIMO = 4;
const MAXIMO = 300;

// Either party can cancel an agreed job, with a reason. Behind a disclosure, like the dispute form,
// and a second step, because a cancelled job cannot be reopened.
export function FormularioCancelar({ ordenId }: { ordenId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [preguntando, setPreguntando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const { pendiente, error, correr } = useAccion();

  // Counted in code points, as the server counts them.
  const largo = Array.from(motivo.trim()).length;

  function pedirConfirmacion(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (largo < MINIMO || largo > MAXIMO) {
      setErrorLocal(`El motivo tiene que tener entre ${MINIMO} y ${MAXIMO} caracteres.`);
      return;
    }
    setErrorLocal(null);
    setPreguntando(true);
  }

  function confirmar() {
    correr(() => cancelarTrabajo(ordenId, motivo.trim()), () => setPreguntando(false));
  }

  const mensajeError = errorLocal ?? error;

  return (
    <div className={styles.disclosure}>
      <button
        type="button"
        className="boton boton--secundario"
        aria-expanded={abierto}
        aria-controls="formulario-cancelar"
        onClick={() => setAbierto((v) => !v)}
      >
        Cancelar este trabajo
      </button>

      {abierto && (
        <form id="formulario-cancelar" className={styles.formulario} onSubmit={pedirConfirmacion} noValidate>
          <p className={styles.ayuda}>
            Si lo cancelás, no se puede deshacer. La otra persona ve el motivo en la orden.
          </p>

          <div className={styles.campoGrupo}>
            <label htmlFor="cancelar-motivo" className="campo-etiqueta">
              Motivo de la cancelación
            </label>
            <textarea
              id="cancelar-motivo"
              className={styles.campoTexto}
              rows={3}
              maxLength={MAXIMO}
              required
              value={motivo}
              aria-describedby="cancelar-motivo-ayuda"
              onChange={(e) => {
                setMotivo(e.target.value);
                setPreguntando(false);
              }}
            />
            <span id="cancelar-motivo-ayuda" className={styles.ayuda}>
              Entre {MINIMO} y {MAXIMO} caracteres. {largo}/{MAXIMO}
            </span>
          </div>

          {!preguntando && (
            <div>
              <button type="submit" className="boton" disabled={pendiente}>
                Cancelar el trabajo
              </button>
            </div>
          )}

          {preguntando && (
            <div className={styles.confirmacion}>
              <p className={styles.pregunta}>¿Seguro que querés cancelar este trabajo? No se puede deshacer.</p>
              <div className={styles.fila}>
                <button type="button" className="boton" disabled={pendiente} onClick={confirmar}>
                  {pendiente ? 'Cancelando…' : 'Sí, cancelar el trabajo'}
                </button>
                <button
                  type="button"
                  className="boton boton--secundario"
                  disabled={pendiente}
                  onClick={() => setPreguntando(false)}
                >
                  Volver
                </button>
              </div>
            </div>
          )}

          {mensajeError && (
            <p role="alert" className={styles.error}>
              {mensajeError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

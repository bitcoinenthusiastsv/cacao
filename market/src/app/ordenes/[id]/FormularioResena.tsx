'use client';

import { useState } from 'react';

import { enviarResena } from './acciones';
import styles from './orden.module.css';
import { useAccion } from './useAccion';

const ETIQUETAS = ['1 estrella', '2 estrellas', '3 estrellas', '4 estrellas', '5 estrellas'];

// One review per order, from the buyer. Stars are radio buttons with text, so the choice is
// readable without colour or images.
export function FormularioResena({ ordenId }: { ordenId: string }) {
  const [puntuacion, setPuntuacion] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const { pendiente, error, correr } = useAccion();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (puntuacion === null) {
      setErrorLocal('Elegí una puntuación de 1 a 5.');
      return;
    }
    setErrorLocal(null);
    correr(() => enviarResena(ordenId, puntuacion, comentario));
  }

  const mensajeError = errorLocal ?? error;

  return (
    <form className={styles.formulario} onSubmit={enviar} noValidate>
      <fieldset className={styles.conjunto}>
        <legend className="campo-etiqueta">Puntuación</legend>
        <div className={styles.opciones}>
          {ETIQUETAS.map((texto, indice) => {
            const valor = indice + 1;
            return (
              <label key={valor} className={styles.opcion}>
                <input
                  type="radio"
                  name="puntuacion"
                  value={valor}
                  checked={puntuacion === valor}
                  onChange={() => setPuntuacion(valor)}
                />
                {texto}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.campoGrupo}>
        <label htmlFor="resena-comentario" className="campo-etiqueta">
          Comentario (opcional)
        </label>
        <textarea
          id="resena-comentario"
          className={styles.campoTexto}
          rows={4}
          maxLength={500}
          value={comentario}
          aria-describedby="resena-contador"
          onChange={(e) => setComentario(e.target.value)}
        />
        <span id="resena-contador" className={`dato ${styles.contador}`}>
          {comentario.length}/500
        </span>
      </div>

      {mensajeError && (
        <p role="alert" className={styles.error}>
          {mensajeError}
        </p>
      )}

      <div>
        <button type="submit" className="boton" disabled={pendiente}>
          {pendiente ? 'Enviando…' : 'Enviar reseña'}
        </button>
      </div>
    </form>
  );
}

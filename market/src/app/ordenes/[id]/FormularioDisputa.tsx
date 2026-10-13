'use client';

import { useState } from 'react';

import { abrirDisputaComprador } from './acciones';
import styles from './orden.module.css';
import { useAccion } from './useAccion';

// The buyer's dispute form. It sits behind a disclosure, so it does not compete with the main
// action. The text says who reviews it and who pays a refund, because the app holds no money.
// A job not paid yet is disputed before payment: the review decides whether it is owed.
export function FormularioDisputa({
  ordenId,
  trabajoSinPagar = false,
  trabajo = false,
}: {
  ordenId: string;
  trabajoSinPagar?: boolean;
  trabajo?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [evidencia, setEvidencia] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const { pendiente, error, correr } = useAccion();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const largoMotivo = Array.from(motivo.trim()).length;
    if (largoMotivo < 10) {
      setErrorLocal('Contá el motivo con al menos 10 caracteres.');
      return;
    }
    setErrorLocal(null);
    correr(() => abrirDisputaComprador(ordenId, motivo, evidencia));
  }

  const mensajeError = errorLocal ?? error;

  return (
    <div className={styles.disclosure}>
      <button
        type="button"
        className="boton boton--secundario"
        aria-expanded={abierto}
        aria-controls="formulario-disputa"
        onClick={() => setAbierto((v) => !v)}
      >
        {trabajoSinPagar ? 'No estoy de acuerdo con el trabajo' : 'Tengo un problema'}
      </button>

      {abierto && (
        <form id="formulario-disputa" className={styles.formulario} onSubmit={enviar} noValidate>
          {trabajoSinPagar ? (
            <p className={styles.ayuda}>Una persona de CacaoMarket revisa el caso y decide si corresponde pagar.</p>
          ) : (
            <p className={styles.ayuda}>
              Un administrador de CacaoMarket revisa cada disputa. CacaoMarket nunca tiene el dinero,
              así que si corresponde un reembolso, lo paga {trabajo ? 'quien trabaja' : 'el vendedor'} fuera de la app y vos lo confirmás
              después.
            </p>
          )}

          <div className={styles.campoGrupo}>
            <label htmlFor="disputa-motivo" className="campo-etiqueta">
              Contá qué pasó
            </label>
            <textarea
              id="disputa-motivo"
              className={styles.campoTexto}
              rows={4}
              maxLength={1000}
              required
              value={motivo}
              aria-describedby="disputa-motivo-ayuda"
              onChange={(e) => setMotivo(e.target.value)}
            />
            <span id="disputa-motivo-ayuda" className={styles.ayuda}>
              Entre 10 y 1000 caracteres. {motivo.length}/1000
            </span>
          </div>

          <div className={styles.campoGrupo}>
            <label htmlFor="disputa-evidencia" className="campo-etiqueta">
              Evidencia (opcional)
            </label>
            <textarea
              id="disputa-evidencia"
              className={styles.campoTexto}
              rows={3}
              maxLength={1000}
              value={evidencia}
              aria-describedby="disputa-evidencia-ayuda"
              onChange={(e) => setEvidencia(e.target.value)}
            />
            <span id="disputa-evidencia-ayuda" className={styles.ayuda}>
              Por ejemplo, el número del pago o lo que recibiste. Hasta 1000 caracteres.
            </span>
          </div>

          {mensajeError && (
            <p role="alert" className={styles.error}>
              {mensajeError}
            </p>
          )}

          <div>
            <button type="submit" className="boton" disabled={pendiente}>
              {pendiente ? 'Abriendo la disputa…' : 'Abrir disputa'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

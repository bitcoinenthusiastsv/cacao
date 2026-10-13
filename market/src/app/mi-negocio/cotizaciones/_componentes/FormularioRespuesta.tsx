'use client';

import { startTransition, useActionState, useState } from 'react';

import { formatoSats, formatoUsd, usdCentavosASats } from '@/lib/dinero';
import { LIMITES, precioDesdeTexto } from '@/lib/servicios';

import { responderCotizacionAccion, type EstadoCotizacionAccion } from '../acciones';
import estilos from '../estilos.module.css';

const ESTADO_INICIAL: EstadoCotizacionAccion = {};

type Props = {
  cotizacionId: string;
  /** BTC price in USD, or null: the preview then shows dollars only. */
  cotizacion: number | null;
};

// The shop's answer to a request: a price in dollars and a message. Several of these can be on
// the page at once, so every id carries the quote's id.
export function FormularioRespuesta({ cotizacionId, cotizacion }: Props) {
  const [estado, despachar, pendiente] = useActionState(responderCotizacionAccion, ESTADO_INICIAL);
  const [precio, setPrecio] = useState('');
  const [mensaje, setMensaje] = useState('');

  const idPrecio = `precio-${cotizacionId}`;
  const idMensaje = `mensaje-${cotizacionId}`;

  const centavos = precioDesdeTexto(precio);
  const sats = centavos !== null && cotizacion !== null ? usdCentavosASats(centavos, cotizacion) : null;

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendiente) return;
    startTransition(() => despachar({ cotizacionId, precio, mensaje }));
  }

  return (
    <form className={estilos.formulario} onSubmit={enviar}>
      <div className={estilos.grupo}>
        <label className="campo-etiqueta" htmlFor={idPrecio}>
          Tu precio en dólares (USD)
        </label>
        <div className={estilos.precio}>
          <span className={estilos.precioSigno} aria-hidden="true">
            $
          </span>
          <input
            id={idPrecio}
            className={`campo ${estilos.precioCampo}`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="25.00"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            aria-describedby={`${idPrecio}-ayuda`}
            required
          />
        </div>
        <p id={`${idPrecio}-ayuda`} className={estilos.ayuda} aria-live="polite">
          {centavos !== null && sats !== null
            ? `Equivale a ${formatoSats(sats)} con la cotización de hoy, a ${formatoUsd(centavos)}.`
            : ''}
        </p>
      </div>

      <div className={estilos.grupo}>
        <label className="campo-etiqueta" htmlFor={idMensaje}>
          Mensaje para el cliente
        </label>
        <textarea
          id={idMensaje}
          className={`campo ${estilos.textarea}`}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          maxLength={LIMITES.mensaje.maximo}
          placeholder="Cuándo podés ir y qué incluye el precio."
          aria-describedby={`${idMensaje}-contador`}
        />
        <p id={`${idMensaje}-contador`} className={estilos.ayuda}>
          {Array.from(mensaje).length} de {LIMITES.mensaje.maximo} caracteres
        </p>
      </div>

      {estado.error && (
        <p className={estilos.error} role="alert">
          {estado.error}
        </p>
      )}

      <button type="submit" className="boton" disabled={pendiente} aria-busy={pendiente}>
        {pendiente ? 'Enviando…' : 'Enviar cotización'}
      </button>
    </form>
  );
}

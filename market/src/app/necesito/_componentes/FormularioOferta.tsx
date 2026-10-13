'use client';

import { useActionState, useState } from 'react';

import { formatoSats, usdCentavosASats } from '@/lib/dinero';
import { LIMITES, precioDesdeTexto } from '@/lib/servicios';

import { ofertarAccion } from '../acciones';
import { ESTADO_INICIAL } from '../_comun/estado';
import estilos from '../estilos.module.css';

type Props = {
  necesidadId: string;
  /** BTC price in USD, or null when none is available. */
  cotizacion: number | null;
};

export function FormularioOferta({ necesidadId, cotizacion }: Props) {
  const [estado, accion, pendiente] = useActionState(ofertarAccion, ESTADO_INICIAL);
  const [precio, setPrecio] = useState('');
  const [mensaje, setMensaje] = useState('');

  const centavos = precio.trim() === '' ? null : precioDesdeTexto(precio);
  const equivalencia =
    centavos !== null && cotizacion !== null
      ? `Equivale a unos ${formatoSats(usdCentavosASats(centavos, cotizacion))}.`
      : '';

  return (
    <form action={accion} className={estilos.formulario} noValidate>
      <input type="hidden" name="necesidadId" value={necesidadId} />

      <div className={estilos.grupo}>
        <label htmlFor="oferta-precio" className="campo-etiqueta">
          Precio en dólares (USD)
        </label>
        <div className={estilos.precio}>
          <span aria-hidden="true">$</span>
          <input
            id="oferta-precio"
            name="precio"
            className="campo"
            inputMode="decimal"
            autoComplete="off"
            placeholder="12.00"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            aria-describedby="oferta-precio-equivalencia"
          />
        </div>
        <p id="oferta-precio-equivalencia" className={estilos.ayuda} aria-live="polite">
          {equivalencia}
        </p>
      </div>

      <div className={estilos.grupo}>
        <label htmlFor="oferta-mensaje" className="campo-etiqueta">
          Tu mensaje
        </label>
        <textarea
          id="oferta-mensaje"
          name="mensaje"
          className={`campo ${estilos.textarea}`}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          maxLength={LIMITES.mensaje.maximo}
          aria-describedby="oferta-mensaje-contador"
        />
        <p id="oferta-mensaje-contador" className={estilos.ayuda}>
          {mensaje.length} de {LIMITES.mensaje.maximo} caracteres
        </p>
      </div>

      <p className={estilos.ayuda}>Cobrás al terminar. Coordiná bien antes de ir.</p>

      {estado.mensaje && (
        <p role={estado.ok ? 'status' : 'alert'} className={estado.ok ? estilos.ok : estilos.error}>
          {estado.mensaje}
        </p>
      )}

      <button type="submit" className="boton" disabled={pendiente}>
        {pendiente ? 'Enviando…' : 'Ofertar'}
      </button>
    </form>
  );
}

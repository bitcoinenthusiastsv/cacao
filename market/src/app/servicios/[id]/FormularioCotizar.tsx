'use client';

import { type FormEvent, startTransition, useActionState, useState } from 'react';

import { LIMITES } from '@/lib/servicios';

import { cotizarAccion } from './acciones';
import estilos from './estilos.module.css';

// The quote request for a service without a fixed price. The text is kept when the request fails.
export function FormularioCotizar({ servicioId }: { servicioId: string }) {
  const [estado, accion, pendiente] = useActionState(cotizarAccion, { error: null });
  const [descripcion, setDescripcion] = useState('');

  // Same reason as the hire form: the typed text must survive a failed request.
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendiente) return;
    const datos = new FormData(evento.currentTarget);
    startTransition(() => accion(datos));
  }

  const { minimo, maximo } = LIMITES.descripcionTrabajo;

  return (
    <form className={estilos.formulario} onSubmit={enviar} noValidate>
      <input type="hidden" name="servicioId" value={servicioId} />

      <div className={estilos.grupo}>
        <label htmlFor="descripcion-trabajo" className="campo-etiqueta">
          Describí el trabajo
        </label>
        <textarea
          id="descripcion-trabajo"
          name="descripcion"
          className={estilos.area}
          rows={4}
          maxLength={maximo}
          value={descripcion}
          aria-describedby="descripcion-trabajo-ayuda"
          aria-invalid={estado.error ? true : undefined}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <p id="descripcion-trabajo-ayuda" className={estilos.ayuda}>
          Entre {minimo} y {maximo} caracteres. {descripcion.length}/{maximo}
        </p>
      </div>

      {estado.error && (
        <p role="alert" className={estilos.error}>
          {estado.error}
        </p>
      )}

      <button type="submit" className="boton" disabled={pendiente}>
        {pendiente ? 'Pidiendo la cotización…' : 'Pedir cotización'}
      </button>

      <p className={estilos.garantia}>
        Quien ofrece el servicio te responde con un precio. Aceptás solo si te parece.
      </p>
    </form>
  );
}

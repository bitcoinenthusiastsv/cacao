'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { buscarEnvio } from './acciones';
import estilos from './estilos.module.css';

// One field and one button. A wrong code is said next to the field, and the field keeps focus.
export function FormularioRastreo() {
  const [estado, accion] = useActionState(buscarEnvio, { codigo: '' });
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado.error) campo.current?.focus();
  }, [estado]);

  return (
    <form action={accion} className={estilos.formulario}>
      <div className={estilos.grupo}>
        <label htmlFor="codigo-envio" className="campo-etiqueta">
          Código del envío
        </label>
        <p id="ayuda-codigo" className={estilos.ayuda}>
          Te lo pasa quien te mandó el dinero. Se ve así: CP-7F3K-92QD
        </p>
        <input
          ref={campo}
          id="codigo-envio"
          name="codigo"
          type="text"
          className={`campo ${estilos.codigo}`}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={estado.codigo}
          aria-describedby={estado.error ? 'ayuda-codigo error-codigo' : 'ayuda-codigo'}
          aria-invalid={estado.error ? true : undefined}
        />
      </div>

      {estado.error && (
        <p id="error-codigo" role="alert" className={estilos.error}>
          {estado.error}
        </p>
      )}

      <BotonSeguir />
    </form>
  );
}

function BotonSeguir() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? 'Buscando…' : 'Seguir'}
    </button>
  );
}

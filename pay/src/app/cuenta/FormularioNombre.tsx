'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { guardarNombre } from './acciones';
import estilos from './estilos.module.css';

export function FormularioNombre({ nombre, volver }: { nombre: string; volver: string }) {
  const [estado, accion] = useActionState(guardarNombre, { nombre });

  return (
    <form action={accion} className={estilos.formulario}>
      <input type="hidden" name="volver" value={volver} />

      <div className={estilos.grupo}>
        <label htmlFor="nombre" className="campo-etiqueta">
          Tu nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          className="campo"
          type="text"
          autoComplete="name"
          maxLength={80}
          defaultValue={estado.nombre}
          aria-describedby={estado.error ? 'error-nombre' : 'ayuda-nombre'}
          aria-invalid={estado.error ? true : undefined}
        />
        <p id="ayuda-nombre" className={estilos.ayuda}>
          Entre 2 y 80 letras. Es el nombre que ven en tus envíos.
        </p>
      </div>

      {estado.error && (
        <div id="error-nombre" role="alert" className={estilos.error}>
          {estado.error}
        </div>
      )}

      <p role="status" aria-live="polite" className="aviso">
        {estado.mensaje ?? ''}
      </p>

      <BotonGuardar />
    </form>
  );
}

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar nombre'}
    </button>
  );
}

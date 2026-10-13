'use client';

import { useFormStatus } from 'react-dom';

import { cerrarSesion } from './acciones';

// Signs out with a server action. The button waits while the sign-out runs.
export function BotonSalir() {
  return (
    <form action={cerrarSesion}>
      <BotonEnviar />
    </form>
  );
}

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton boton--secundario" disabled={pending}>
      {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </button>
  );
}

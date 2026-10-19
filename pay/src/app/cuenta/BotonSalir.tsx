'use client';

import { useClerk } from '@clerk/nextjs';
import { useState } from 'react';

// Signs out on this device with Clerk, then goes home. The button waits while the sign-out runs.
export function BotonSalir() {
  const { signOut } = useClerk();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await signOut({ redirectUrl: '/' });
  }

  return (
    <button type="button" className="boton boton--secundario" disabled={saliendo} onClick={salir}>
      {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </button>
  );
}

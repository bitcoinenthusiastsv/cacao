'use client';

import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Signs out of Clerk on this device. The header reads the session on the server, so the page is
// refreshed once the sign-out is done.
export function BotonSalir() {
  const { signOut } = useClerk();
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function cerrar() {
    setSaliendo(true);
    await signOut(() => {
      router.replace('/');
      router.refresh();
    });
  }

  return (
    <button type="button" className="boton boton--secundario" disabled={saliendo} onClick={cerrar}>
      {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </button>
  );
}

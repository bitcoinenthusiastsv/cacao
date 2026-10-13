import Link from 'next/link';
import { connection } from 'next/server';

import { sesionActual } from '@/servidor/sesion';

import estilos from './EnlaceCuenta.module.css';

// Header entry for the account. Reads the session, so the header wraps it in Suspense.
// Signed out: "Entrar". Signed in: the first name, or "Cuenta" when there is no name yet.
export async function EnlaceCuenta() {
  // The session auth client reads the clock; this keeps that read at request time.
  await connection();
  const sesion = await sesionActual();
  if (!sesion) {
    return (
      <Link href="/entrar" className={estilos.enlace}>
        Entrar
      </Link>
    );
  }

  const primerNombre = sesion.usuario.nombre.trim().split(/\s+/)[0] || 'Cuenta';
  return (
    <Link href="/cuenta" className={estilos.enlace}>
      {primerNombre}
    </Link>
  );
}

// The same link as the fallback, so the header keeps its width while the session loads.
export function EnlaceCuentaCargando() {
  return (
    <Link href="/entrar" className={estilos.enlace}>
      Entrar
    </Link>
  );
}

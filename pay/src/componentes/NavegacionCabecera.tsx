import { connection } from 'next/server';

import { sesionActual } from '@/servidor/sesion';

import { NavegacionActual } from './NavegacionActual';

// The header sections. Monitor is listed only for administrators, so this reads the session and
// the header wraps it in Suspense.
export async function NavegacionCabecera() {
  // The session auth client reads the clock; this keeps that read at request time.
  await connection();
  const sesion = await sesionActual();
  return <NavegacionActual variante="cabecera" esAdmin={sesion?.usuario.esAdmin ?? false} />;
}

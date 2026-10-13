import { connection } from 'next/server';
import { Suspense } from 'react';

import { sesionActual } from '@/servidor/sesion';

import { SubNavegacion } from './SubNavegacion';

// Sub-navigation for the shop sections. It shows only when the visitor has a shop, so the
// application page stays clean. The session read sits behind a boundary, not at layout level.
export default function LayoutMiNegocio({ children }: LayoutProps<'/mi-negocio'>) {
  return (
    <>
      <Suspense fallback={null}>
        <NavegacionNegocio />
      </Suspense>
      {children}
    </>
  );
}

async function NavegacionNegocio() {
  await connection();
  const sesion = await sesionActual();
  if (!sesion?.negocio) return null;
  return <SubNavegacion />;
}

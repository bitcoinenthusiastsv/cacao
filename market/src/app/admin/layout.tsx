import type { Metadata } from 'next';
import { Suspense } from 'react';

import { exigirAdmin } from '@/servidor/sesion';

import { NavegacionAdmin } from './NavegacionAdmin';
import { NavegacionAdminActual } from './NavegacionAdminActual';
import estilos from './estilos.module.css';

export const metadata: Metadata = {
  title: 'Administración',
};

// Blocking route: the admin check runs before anything streams. A visitor who is not an admin
// gets a real 404 and no admin markup. Without this, the status would already be 200.
export const instant = false;

// Layouts do not re-run on every navigation, so each page and each action checks again.
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  await exigirAdmin();

  return (
    <div className={estilos.marco}>
      <h1 className={estilos.titulo}>Administración</h1>
      {/* usePathname suspends under Cache Components, so the list without the current mark is the fallback. */}
      <Suspense fallback={<NavegacionAdmin />}>
        <NavegacionAdminActual />
      </Suspense>
      <div className={estilos.contenido}>{children}</div>
    </div>
  );
}

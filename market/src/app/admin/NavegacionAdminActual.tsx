'use client';

import { usePathname } from 'next/navigation';

import { NavegacionAdmin } from './NavegacionAdmin';

// Marks the current admin section. Client only because it reads the pathname.
export function NavegacionAdminActual() {
  const ruta = usePathname();
  return <NavegacionAdmin actual={ruta} />;
}

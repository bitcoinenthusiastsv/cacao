'use client';

import { usePathname } from 'next/navigation';

import { NavegacionPrincipal } from './NavegacionPrincipal';

// Marks the current section. Client only because it reads the pathname.
// The badge arrives as a server-rendered element, so this component never reads the session.
export function NavegacionActual({
  variante,
  insignia,
}: {
  variante: 'barra' | 'cabecera';
  insignia?: React.ReactNode;
}) {
  const ruta = usePathname();
  return <NavegacionPrincipal actual={ruta} variante={variante} insignia={insignia} />;
}

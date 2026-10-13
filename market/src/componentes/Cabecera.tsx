import Link from 'next/link';
import { Suspense } from 'react';

import { ContadorCarrito } from './ContadorCarrito';
import { EnlaceCuenta, EnlaceCuentaCargando } from './EnlaceCuenta';
import estilos from './EnlaceCuenta.module.css';
import { InsigniaAvisos } from './InsigniaAvisos';
import { Logo } from './Logo';
import { NavegacionActual } from './NavegacionActual';
import { NavegacionPrincipal } from './NavegacionPrincipal';

export function Cabecera() {
  return (
    <header className="cabecera">
      <div className={`contenedor cabecera__fila ${estilos.fila}`}>
        <Link href="/" className="logo-enlace" aria-label="CacaoMarket, inicio">
          <Logo />
        </Link>
        <Suspense fallback={<NavegacionPrincipal variante="cabecera" />}>
          <NavegacionActual
            variante="cabecera"
            insignia={
              <Suspense fallback={null}>
                <InsigniaAvisos />
              </Suspense>
            }
          />
        </Suspense>
        <div className={estilos.acciones}>
          <Suspense fallback={<EnlaceCuentaCargando />}>
            <EnlaceCuenta />
          </Suspense>
          <ContadorCarrito />
        </div>
      </div>
    </header>
  );
}

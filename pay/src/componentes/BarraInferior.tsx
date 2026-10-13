import { Suspense } from 'react';

import { NavegacionActual } from './NavegacionActual';
import { NavegacionPrincipal } from './NavegacionPrincipal';

// Fixed tab bar for phones. On wide screens the header carries the sections instead (CSS).
// usePathname suspends on dynamic routes under cacheComponents, so it needs a boundary.
export function BarraInferior() {
  return (
    <div className="barra-inferior">
      <Suspense fallback={<NavegacionPrincipal variante="barra" />}>
        <NavegacionActual variante="barra" />
      </Suspense>
    </div>
  );
}

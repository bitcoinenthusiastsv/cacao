import { Suspense } from 'react';

import { InsigniaAvisos } from './InsigniaAvisos';
import { NavegacionActual } from './NavegacionActual';
import { NavegacionPrincipal } from './NavegacionPrincipal';

// Fixed tab bar for phones. On wide screens the header carries the same links instead (CSS).
// usePathname suspends on dynamic routes under cacheComponents, so it needs a boundary.
// The notices badge reads the session, so it has its own boundary and never delays the bar.
export function BarraInferior() {
  return (
    <div className="barra-inferior">
      <Suspense fallback={<NavegacionPrincipal variante="barra" />}>
        <NavegacionActual
          variante="barra"
          insignia={
            <Suspense fallback={null}>
              <InsigniaAvisos />
            </Suspense>
          }
        />
      </Suspense>
    </div>
  );
}

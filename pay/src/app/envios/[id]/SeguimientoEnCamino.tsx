'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { estadoDeEnvioAccion } from './acciones';

const INTERVALO_MS = 5000;

/**
 * While the transfer is on its way, asks the server for its state every few seconds, and only while
 * the tab is visible. When the state changes (the monitor completed it, or it failed), the page is
 * refreshed and this stops, because the page no longer shows it as on its way.
 */
export function SeguimientoEnCamino({ envioId }: { envioId: string }) {
  const router = useRouter();

  useEffect(() => {
    let parado = false;

    function parar() {
      parado = true;
      clearInterval(temporizador);
    }

    async function revisar() {
      if (parado || document.visibilityState !== 'visible') return;
      try {
        const estado = await estadoDeEnvioAccion(envioId);
        if (parado) return;
        if (estado !== 'procesando') {
          parar();
          router.refresh();
        }
      } catch {
        // A failed check is tried again on the next tick; the page itself is still correct.
      }
    }

    function alVolverLaPestana() {
      if (document.visibilityState === 'visible') void revisar();
    }

    const temporizador = setInterval(revisar, INTERVALO_MS);
    document.addEventListener('visibilitychange', alVolverLaPestana);
    return () => {
      parar();
      document.removeEventListener('visibilitychange', alVolverLaPestana);
    };
  }, [envioId, router]);

  return <p className="aviso">Esta página se actualiza sola mientras el dinero va en camino.</p>;
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const CADA_MS = 10_000;

// Asks the server for the transfer again every 10 seconds while the tab is visible and the state
// can still change. The page is server-rendered, so a refresh re-reads the transfer only.
export function ActualizarEnvio({ activo }: { activo: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!activo) return;
    const actualizar = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const intervalo = window.setInterval(actualizar, CADA_MS);
    // Back on the tab: read the state now rather than at the next tick.
    document.addEventListener('visibilitychange', actualizar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', actualizar);
    };
  }, [activo, router]);

  return null;
}

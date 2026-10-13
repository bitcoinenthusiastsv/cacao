'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { contarUnidades, EVENTO_CARRITO, leerCarrito } from '@/lib/carrito';

// Reads the cart from the browser. The server snapshot is 0, so the first render matches the
// server and the real count arrives right after hydration.
function suscribir(avisar: () => void) {
  window.addEventListener(EVENTO_CARRITO, avisar);
  window.addEventListener('storage', avisar);
  return () => {
    window.removeEventListener(EVENTO_CARRITO, avisar);
    window.removeEventListener('storage', avisar);
  };
}

function unidades(): number {
  return contarUnidades(leerCarrito());
}

export function ContadorCarrito() {
  const cuantas = useSyncExternalStore(suscribir, unidades, () => 0);
  const etiqueta =
    cuantas === 0
      ? 'Carrito, vacío'
      : `Carrito, ${cuantas} ${cuantas === 1 ? 'unidad' : 'unidades'}`;

  return (
    <Link href="/carrito" className="carrito-enlace" aria-label={etiqueta}>
      {/* Hidden visually below 360px; the link keeps its name from aria-label. */}
      <span className="carrito-enlace__texto">Carrito</span>
      <span className="contador" aria-hidden="true">
        {cuantas}
      </span>
    </Link>
  );
}

'use client';

import { useEffect, useRef } from 'react';

// The two events the browser sends. The server checks the name, the object and the path again.
export type EventoNavegador = 'vista_producto' | 'agrego_carrito' | 'vista_servicio';

// Sends one event to /api/evento. keepalive lets it finish when the page changes next. Errors are
// dropped: analytics must never get in the way of a purchase.
export function enviarEventoNavegador(nombre: EventoNavegador, objeto: string): void {
  try {
    void fetch('/api/evento', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, objeto, ruta: window.location.pathname }),
    }).catch(() => undefined);
  } catch {
    // No fetch in this browser: nothing to record.
  }
}

// Renders nothing. Posts the event once when the page is shown.
export function RegistrarEvento({ nombre, objeto }: { nombre: EventoNavegador; objeto: string }) {
  // A ref, so the development double mount does not send it twice.
  const enviado = useRef(false);
  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    enviarEventoNavegador(nombre, objeto);
  }, [nombre, objeto]);
  return null;
}

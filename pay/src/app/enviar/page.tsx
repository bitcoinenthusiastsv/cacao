import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { cotizacionUsdBtc } from '@/lib/precio/fuente';
import { exigirSesion } from '@/servidor/sesion';
import { tarifasDetalle } from '@/servidor/tasas';

import { AsistenteEnvio } from './AsistenteEnvio';

export const metadata: Metadata = {
  title: 'Enviar dinero',
};

// The sender's three steps. The session and the fees are read per request, so the form waits
// behind a boundary.
export default function PaginaEnviar() {
  return (
    <Suspense fallback={<p role="status">Cargando el envío…</p>}>
      <Asistente />
    </Suspense>
  );
}

async function Asistente() {
  await connection();
  await exigirSesion('/enviar');
  const [tarifas, precioDisponible] = await Promise.all([tarifasDetalle(), precioBtcDisponible()]);
  return <AsistenteEnvio tarifas={tarifas} precioDisponible={precioDisponible} />;
}

// Lightning needs the BTC price. Its absence only switches Lightning off; cash and bank still work.
async function precioBtcDisponible(): Promise<boolean> {
  try {
    await cotizacionUsdBtc();
    return true;
  } catch (error) {
    console.error('Precio de bitcoin:', error instanceof Error ? error.message : error);
    return false;
  }
}

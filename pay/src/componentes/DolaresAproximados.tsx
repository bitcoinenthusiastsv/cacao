import { connection } from 'next/server';

import { cotizacionUsdBtc } from '@/lib/precio/fuente';

import { dolaresDeSats } from './textosEnvio';

// The BTC price is optional here: without it a sats amount still shows, with a plain note.
export async function precioBtcOpcional(): Promise<number | null> {
  try {
    return await cotizacionUsdBtc();
  } catch (error) {
    console.error('Precio de bitcoin:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** "Unos $96.50 en dólares", read at the current price. */
export async function DolaresAproximados({ sats }: { sats: number }) {
  // The price is read per request, so it waits for the request like the transfer does.
  await connection();
  const dolares = dolaresDeSats(sats, await precioBtcOpcional());
  return dolares ? <p>{`Unos ${dolares} en dólares.`}</p> : <p>No pudimos calcular cuántos dólares son ahora.</p>;
}

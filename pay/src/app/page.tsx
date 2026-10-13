import { connection } from 'next/server';
import { Suspense } from 'react';

import { Boton } from '@/componentes/Boton';
import { Cotizador } from '@/componentes/Cotizador';
import { cotizacionUsdBtc } from '@/lib/precio/fuente';

import estilos from './page.module.css';

// The promise and the points are static. The quote needs the BTC price, which is fetched at
// request time, so only the calculator waits for it.
export default function Inicio() {
  return (
    <div className={estilos.inicio}>
      <section className="encabezado">
        <h1>Mandá dinero a El Salvador y mirá cada centavo.</h1>
        <p>
          Antes de confirmar ves el tipo de cambio, la comisión y cuánto llega. Elegís si la persona lo recibe en
          efectivo, en su cuenta bancaria o en bitcoin por Lightning.
        </p>
      </section>

      <section className={estilos.bloque} aria-labelledby="titulo-cotizador">
        <h2 id="titulo-cotizador">Cotizá tu envío</h2>
        <Suspense fallback={<p role="status">Cargando la cotización…</p>}>
          <CotizadorConPrecio />
        </Suspense>
      </section>

      <section className={estilos.bloque} aria-labelledby="titulo-puntos">
        <h2 id="titulo-puntos" className="solo-lectores">
          Cómo funciona
        </h2>
        <ul className={estilos.puntos}>
          <li>Las comisiones aparecen aparte del tipo de cambio.</li>
          <li>Ves cuánto llega antes de confirmar.</li>
          <li>Cada envío tiene un código para seguirlo.</li>
        </ul>
        <div>
          <Boton href="/enviar">Enviar dinero</Boton>
        </div>
      </section>

      <p className={estilos.pie}>CacaoPay es una simulación. No mueve dinero real.</p>
    </div>
  );
}

async function CotizadorConPrecio() {
  // The price is read per request; the quote stays correct when the source is slow or down.
  await connection();
  const fijo = Boolean(process.env.PRECIO_FIJO_USD_BTC);
  const fuenteBtc = fijo ? 'Precio de bitcoin fijo de demostración' : 'Precio de bitcoin: Coinbase y Kraken';
  let usdBtc: number | null = null;
  try {
    usdBtc = await cotizacionUsdBtc();
  } catch (error) {
    // Cash and bank quotes still work without it; the calculator says Lightning is not available.
    console.error('Precio de bitcoin:', error instanceof Error ? error.message : error);
  }
  return <Cotizador usdBtc={usdBtc} fuenteBtc={fuenteBtc} />;
}

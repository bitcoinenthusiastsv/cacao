'use client';

import { useId, useState } from 'react';

import { formatoUsd } from '@/lib/dinero';
import { cotizar, type Cotizacion, type Entrega, formatoMonto, TARIFAS, TASA_EUR_USD } from '@/lib/cotizacion';

import estilos from './Cotizador.module.css';

const ENTREGAS: { valor: Entrega; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'cuenta', etiqueta: 'Cuenta bancaria' },
  { valor: 'lightning', etiqueta: 'Bitcoin por Lightning (sats)' },
];

// "50", "50.5" and "50,25" are amounts; anything else is not, and the field says so.
function aCentavos(texto: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(texto.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

// Thousands separators and at most two decimals, as the rest of the app shows numbers.
function numero(valor: number): string {
  return valor.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Quote preview for the home page. Works without signing in: the BTC price comes from the server
 * (usdBtc), and every line is computed here by cotizar().
 */
export function Cotizador({ usdBtc, fuenteBtc }: { usdBtc: number | null; fuenteBtc: string }) {
  const id = useId();
  const [montoTexto, setMontoTexto] = useState('50');
  const [moneda, setMoneda] = useState<'USD' | 'EUR'>('USD');
  const [entrega, setEntrega] = useState<Entrega>('efectivo');

  const centavos = aCentavos(montoTexto);
  const resultado =
    centavos === null
      ? null
      : cotizar({
          monedaOrigen: moneda,
          montoOrigenCentavos: centavos,
          entrega,
          tarifas: TARIFAS,
          eurUsd: TASA_EUR_USD,
          usdBtc,
          fuenteBtc,
        });
  const error =
    centavos === null
      ? 'Escribí el monto con números, por ejemplo 50 o 50.25.'
      : resultado && 'error' in resultado
        ? resultado.error
        : null;
  const cotizacion: Cotizacion | null = resultado && !('error' in resultado) ? resultado : null;

  return (
    <div className={estilos.cotizador}>
      <form className={estilos.formulario} onSubmit={(e) => e.preventDefault()}>
        <div className={estilos.grupo}>
          <label htmlFor={`${id}-monto`} className="campo-etiqueta">
            Monto a enviar
          </label>
          <input
            id={`${id}-monto`}
            className="campo dato"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={error ? true : undefined}
          />
        </div>

        <div className={estilos.fila}>
          <div className={estilos.grupo}>
            <label htmlFor={`${id}-moneda`} className="campo-etiqueta">
              Moneda que enviás
            </label>
            <select
              id={`${id}-moneda`}
              className="campo"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as 'USD' | 'EUR')}
            >
              <option value="USD">Dólares (USD)</option>
              <option value="EUR">Euros (EUR)</option>
            </select>
          </div>

          <div className={estilos.grupo}>
            <label htmlFor={`${id}-entrega`} className="campo-etiqueta">
              Cómo recibe el dinero
            </label>
            <select
              id={`${id}-entrega`}
              className="campo"
              value={entrega}
              onChange={(e) => setEntrega(e.target.value as Entrega)}
            >
              {ENTREGAS.map((o) => (
                <option key={o.valor} value={o.valor} disabled={o.valor === 'lightning' && usdBtc === null}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {usdBtc === null && (
          <p className={estilos.aviso}>
            No tenemos el precio de bitcoin ahora, así que el envío por Lightning no está disponible. Efectivo y
            cuenta bancaria sí.
          </p>
        )}
      </form>

      {error && (
        <p id={`${id}-error`} role="alert" className={estilos.error}>
          {error}
        </p>
      )}

      {cotizacion && <Lineas cotizacion={cotizacion} usdBtc={usdBtc} />}
    </div>
  );
}

function Lineas({ cotizacion: c, usdBtc }: { cotizacion: Cotizacion; usdBtc: number | null }) {
  const enSats = c.monedaDestino === 'SATS';

  let tipo: string;
  if (enSats) tipo = `1 ${c.monedaOrigen} = ${numero(c.tasa)} sats`;
  else if (c.monedaOrigen === 'EUR') tipo = `1 EUR = ${numero(c.tasa)} USD`;
  else tipo = '1 USD = 1 USD';

  // A sats amount is shown with its dollar value next to it, as the price is shown everywhere else.
  const aproximado =
    enSats && usdBtc !== null ? `aprox. ${formatoUsd(Math.floor((c.montoDestino * usdBtc) / 1_000_000))}` : null;

  const minutos = c.minutosEstimados === 1 ? 'Llega en un minuto.' : `Llega en unos ${c.minutosEstimados} minutos.`;

  return (
    <dl className={estilos.lineas} aria-live="polite">
      <div>
        <dt>Enviás</dt>
        <dd className="dato">{formatoMonto(c.montoOrigenCentavos, c.monedaOrigen)}</dd>
      </div>
      <div>
        <dt>Comisión</dt>
        <dd className="dato">{formatoMonto(c.comisionCentavos, c.monedaOrigen)}</dd>
      </div>
      <div>
        <dt>Tipo de cambio</dt>
        <dd>
          <span className="dato">{tipo}</span>
          <small className={estilos.nota}>{c.tasaFuente}</small>
        </dd>
      </div>
      <div className={estilos.recibe}>
        <dt>Recibe</dt>
        <dd>
          <span className={`dato ${estilos.grande}`}>{formatoMonto(c.montoDestino, c.monedaDestino)}</span>
          {aproximado && <small className={estilos.nota}>{aproximado}</small>}
          <small className={estilos.nota}>{minutos}</small>
        </dd>
      </div>
    </dl>
  );
}

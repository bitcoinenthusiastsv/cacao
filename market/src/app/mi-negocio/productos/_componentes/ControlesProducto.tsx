'use client';

import { useState, useTransition } from 'react';

import { cambiarActivoAccion, cambiarStockAccion } from '../acciones';
import { STOCK_MAXIMO } from '../_comun/precio';
import estilos from '../estilos.module.css';

type Props = {
  id: string;
  nombre: string;
  stock: number;
  activo: boolean;
};

// Quick actions on a row of the list: stock stepper and pause or activate. Each one saves
// through a server action, so the list shows what the database kept.
export function ControlesProducto({ id, nombre, stock, activo }: Props) {
  const [pendiente, transicion] = useTransition();
  const [texto, setTexto] = useState(String(stock));
  const [ultimoStock, setUltimoStock] = useState(stock);
  const [error, setError] = useState<string | null>(null);

  // After a save the server sends the new stock. Adopting it during render avoids an effect.
  if (stock !== ultimoStock) {
    setUltimoStock(stock);
    setTexto(String(stock));
  }

  const numero = /^\d+$/.test(texto.trim()) ? Number(texto) : null;

  function guardarStock(nuevo: number) {
    setError(null);
    setTexto(String(nuevo));
    transicion(async () => {
      const r = await cambiarStockAccion(id, nuevo);
      if (!r.ok) {
        setError(r.mensaje);
        setTexto(String(stock));
      }
    });
  }

  function restar() {
    if (numero !== null && numero > 0) guardarStock(numero - 1);
  }

  function sumar() {
    const base = numero ?? stock;
    if (base < STOCK_MAXIMO) guardarStock(base + 1);
  }

  // Typed values are saved when the field loses focus, so one save covers a whole edit.
  function alTerminarDeEscribir() {
    if (numero === null || numero > STOCK_MAXIMO) {
      setError(`El stock tiene que ser un número entero entre 0 y ${STOCK_MAXIMO}.`);
      setTexto(String(stock));
      return;
    }
    if (numero !== stock) guardarStock(numero);
  }

  function alternar() {
    setError(null);
    transicion(async () => {
      const r = await cambiarActivoAccion(id, !activo);
      if (!r.ok) setError(r.mensaje);
    });
  }

  return (
    <div className={estilos.controlesProducto}>
      <div className={estilos.controlesStock}>
        <label className={estilos.etiquetaStock} htmlFor={`stock-${id}`}>
          Stock
        </label>
        <div className="stepper">
          <button
            type="button"
            onClick={restar}
            disabled={pendiente || numero === 0}
            aria-label={`Restar una unidad de stock de ${nombre}`}
          >
            −
          </button>
          <input
            id={`stock-${id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={alTerminarDeEscribir}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <button
            type="button"
            onClick={sumar}
            disabled={pendiente || (numero ?? stock) >= STOCK_MAXIMO}
            aria-label={`Sumar una unidad de stock de ${nombre}`}
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`boton boton--secundario ${estilos.controlesBoton}`}
        onClick={alternar}
        disabled={pendiente}
      >
        {activo ? 'Pausar' : 'Activar'}
      </button>

      <p className={estilos.meta} role="status" aria-live="polite">
        {pendiente ? 'Guardando…' : ''}
      </p>
      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

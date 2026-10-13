'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { agregarAlCarrito } from '@/lib/carrito';

import { Boton } from './Boton';
import { enviarEventoNavegador } from './RegistrarEvento';

export type ProductoParaCarrito = {
  id: string;
  negocioId: string;
  negocioNombre: string;
  nombre: string;
  unidad: string;
  precioUsdCentavos: number;
  foto: string | null;
  stock: number;
};

const TOPE_POR_PEDIDO = 99;

// Quantity stepper and add button. The reason it is disabled is written under the button.
export function AgregarAlCarrito({
  producto,
  motivoNoDisponible,
}: {
  producto: ProductoParaCarrito;
  motivoNoDisponible: string | null;
}) {
  const maximo = Math.min(producto.stock, TOPE_POR_PEDIDO);
  const disponible = motivoNoDisponible === null && maximo >= 1;
  const [cantidad, setCantidad] = useState(1);
  const [agregadas, setAgregadas] = useState<number | null>(null);
  const idCampo = useId();
  const idMotivo = useId();

  const ajustada = Math.min(Math.max(cantidad, 1), Math.max(maximo, 1));

  function cambiar(nueva: number) {
    if (!Number.isFinite(nueva)) return;
    setCantidad(Math.min(Math.max(Math.trunc(nueva), 1), Math.max(maximo, 1)));
  }

  function agregar() {
    // Only the fields the cart keeps. The stock is not part of a cart line.
    agregarAlCarrito(
      {
        productoId: producto.id,
        negocioId: producto.negocioId,
        negocioNombre: producto.negocioNombre,
        nombre: producto.nombre,
        unidad: producto.unidad,
        precioUsdCentavos: producto.precioUsdCentavos,
        foto: producto.foto,
      },
      ajustada,
    );
    // Only a successful add is a funnel step.
    enviarEventoNavegador('agrego_carrito', producto.id);
    setAgregadas(ajustada);
  }

  return (
    <div className="compra">
      {disponible && (
        <div className="cantidad">
          <label htmlFor={idCampo}>Cantidad</label>
          <div className="stepper">
            <button
              type="button"
              aria-label="Quitar una unidad"
              onClick={() => cambiar(ajustada - 1)}
              disabled={ajustada <= 1}
            >
              −
            </button>
            <input
              id={idCampo}
              type="number"
              inputMode="numeric"
              min={1}
              max={maximo}
              value={ajustada}
              onChange={(e) => cambiar(Number.parseInt(e.target.value, 10))}
            />
            <button
              type="button"
              aria-label="Sumar una unidad"
              onClick={() => cambiar(ajustada + 1)}
              disabled={ajustada >= maximo}
            >
              +
            </button>
          </div>
        </div>
      )}

      <Boton
        onClick={agregar}
        disabled={!disponible}
        aria-describedby={!disponible ? idMotivo : undefined}
      >
        Agregar al carrito
      </Boton>

      {!disponible && motivoNoDisponible && (
        <p id={idMotivo} className="motivo">
          {motivoNoDisponible}
        </p>
      )}

      {agregadas !== null && (
        <p className="confirmacion" role="status">
          Listo: agregaste {agregadas} {agregadas === 1 ? 'unidad' : 'unidades'} al carrito.{' '}
          <Link href="/carrito">Ver carrito</Link>
        </p>
      )}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';

import { Boton } from '@/componentes/Boton';
import { formatoSats, formatoUsd, usdCentavosASats } from '@/lib/dinero';

import { guardarProductoAccion } from '../acciones';
import { precioACentavos, STOCK_MAXIMO } from '../_comun/precio';
import type { CategoriaOpcion, DatosProducto } from '../_comun/tipos';
import estilos from '../estilos.module.css';

import { FotosProducto, MAXIMO_FOTOS } from './FotosProducto';

// Common units from the farms; the field still takes any text.
const UNIDADES_COMUNES = [
  'libra',
  'media libra',
  'kilo',
  'docena',
  'media docena',
  'unidad',
  'manojo',
  'bolsa',
  'frasco',
  'litro',
  'botella 750 ml',
];

export type ValoresIniciales = {
  /** Null when the product is new. */
  id: string | null;
  nombre: string;
  descripcion: string;
  unidad: string;
  categoriaId: number | null;
  /** USD as text, for example "3.50". Empty for a new product. */
  precio: string;
  /** Text too, so a new product starts with an empty field the seller must fill. */
  stock: string;
  activo: boolean;
  fotos: string[];
};

type Props = {
  categorias: CategoriaOpcion[];
  /** BTC price in USD, or null when no source answers: the form then shows dollars only. */
  cotizacion: number | null;
  inicial: ValoresIniciales;
};

function texto(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor : '';
}

export function FormularioProducto({ categorias, cotizacion, inicial }: Props) {
  const [pendiente, transicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [precio, setPrecio] = useState(inicial.precio);
  const [fotos, setFotos] = useState(inicial.fotos);
  const [subiendo, setSubiendo] = useState(0);

  const lectura = precioACentavos(precio);
  const sats =
    lectura.ok && cotizacion !== null ? usdCentavosASats(lectura.centavos, cotizacion) : null;

  // The form is submitted in script, not through a form action: a failed save then keeps
  // what the seller typed. The server checks every field again.
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);

    const cuerpo: DatosProducto = {
      id: inicial.id,
      nombre: texto(datos, 'nombre'),
      descripcion: texto(datos, 'descripcion'),
      unidad: texto(datos, 'unidad'),
      categoria: texto(datos, 'categoria'),
      precio,
      stock: texto(datos, 'stock'),
      activo: datos.get('activo') === 'on',
      fotos,
    };

    setError(null);
    transicion(async () => {
      const r = await guardarProductoAccion(cuerpo);
      // On success the action redirects to the list, so only failures reach this line.
      if (!r.ok) setError(r.mensaje);
    });
  }

  return (
    <form className={estilos.formulario} onSubmit={enviar}>
      <div className={estilos.grupo}>
        <label className="campo-etiqueta" htmlFor="nombre">
          Nombre del producto
        </label>
        <input
          id="nombre"
          name="nombre"
          className="campo"
          defaultValue={inicial.nombre}
          maxLength={80}
          autoComplete="off"
          required
        />
      </div>

      <div className={estilos.grupo}>
        <label className="campo-etiqueta" htmlFor="categoria">
          Categoría
        </label>
        <select
          id="categoria"
          name="categoria"
          className={`campo ${estilos.select}`}
          defaultValue={inicial.categoriaId ?? ''}
          required
        >
          <option value="" disabled>
            Elegí una categoría
          </option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className={estilos.grupo}>
        <label className="campo-etiqueta" htmlFor="descripcion">
          Descripción
        </label>
        <textarea
          id="descripcion"
          name="descripcion"
          className={`campo ${estilos.textarea}`}
          defaultValue={inicial.descripcion}
          maxLength={600}
          aria-describedby="descripcion-ayuda"
        />
        <p id="descripcion-ayuda" className={estilos.ayuda}>
          Hasta 600 caracteres. Contá de dónde viene y cómo lo cosechaste.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label className="campo-etiqueta" htmlFor="unidad">
          Unidad de venta
        </label>
        <input
          id="unidad"
          name="unidad"
          className="campo"
          list="unidades-comunes"
          defaultValue={inicial.unidad}
          maxLength={40}
          autoComplete="off"
          aria-describedby="unidad-ayuda"
          required
        />
        <datalist id="unidades-comunes">
          {UNIDADES_COMUNES.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <p id="unidad-ayuda" className={estilos.ayuda}>
          Por ejemplo libra, docena, unidad o botella 750 ml.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label className="campo-etiqueta" htmlFor="precio">
          Precio en dólares (USD)
        </label>
        <div className={estilos.precio}>
          <span className={estilos.precioSigno} aria-hidden="true">
            $
          </span>
          <input
            id="precio"
            className={`campo ${estilos.precioCampo}`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="3.50"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            aria-describedby="precio-equivalencia precio-nota"
            required
          />
        </div>
        <p id="precio-equivalencia" className={`${estilos.ayuda} ${estilos.equivalencia}`} aria-live="polite">
          {sats !== null && lectura.ok
            ? `Equivale a ${formatoSats(sats)} con la cotización de hoy, a ${formatoUsd(lectura.centavos)}.`
            : cotizacion === null
              ? 'No pudimos leer el precio de bitcoin ahora. Podés guardar igual en dólares.'
              : ''}
        </p>
        <p id="precio-nota" className={estilos.ayuda}>
          El precio se fija en dólares; los sats se calculan al momento del pedido.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label className="campo-etiqueta" htmlFor="stock">
          Stock disponible
        </label>
        <input
          id="stock"
          name="stock"
          className="campo"
          type="number"
          inputMode="numeric"
          min={0}
          max={STOCK_MAXIMO}
          step={1}
          defaultValue={inicial.stock}
          aria-describedby="stock-ayuda"
          required
        />
        <p id="stock-ayuda" className={estilos.ayuda}>
          Unidades que tenés ahora. Con 0, el producto aparece agotado.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label className={estilos.casilla}>
          <input type="checkbox" name="activo" defaultChecked={inicial.activo} />
          Visible para compradores
        </label>
        <p className={estilos.ayuda}>Si lo desmarcás, el producto queda pausado y no aparece en el catálogo.</p>
      </div>

      <FotosProducto
        fotos={fotos}
        onAgregar={(url) => setFotos((previas) => (previas.length < MAXIMO_FOTOS ? [...previas, url] : previas))}
        onQuitar={(indice) => setFotos((previas) => previas.filter((_, i) => i !== indice))}
        onProgreso={(cambio) => setSubiendo((n) => n + cambio)}
      />

      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
      {subiendo > 0 && (
        <p className={estilos.ayuda} role="status">
          Esperá a que termine de subir la foto para guardar.
        </p>
      )}

      <div className={estilos.acciones}>
        <button type="submit" className="boton" disabled={pendiente || subiendo > 0} aria-busy={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar producto'}
        </button>
        <Boton href="/mi-negocio/productos" variante="secundario">
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

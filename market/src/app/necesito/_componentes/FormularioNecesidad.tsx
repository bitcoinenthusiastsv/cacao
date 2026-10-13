'use client';

import { useActionState, useState } from 'react';

import { formatoSats, usdCentavosASats } from '@/lib/dinero';
import { LIMITES, precioDesdeTexto } from '@/lib/servicios';
import type { CategoriaServicio } from '@/servidor/servicios';

import { publicarNecesidadAccion } from '../acciones';
import { ESTADO_INICIAL } from '../_comun/estado';
import estilos from '../estilos.module.css';

type Props = {
  categorias: CategoriaServicio[];
  /** BTC price in USD, or null when none is available: the budget then shows dollars only. */
  cotizacion: number | null;
};

// Every field is controlled, so a failed save keeps what the person typed.
export function FormularioNecesidad({ categorias, cotizacion }: Props) {
  const [estado, accion, pendiente] = useActionState(publicarNecesidadAccion, ESTADO_INICIAL);
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [zona, setZona] = useState('');
  const [presupuesto, setPresupuesto] = useState('');

  const centavos = presupuesto.trim() === '' ? null : precioDesdeTexto(presupuesto);
  const equivalencia =
    centavos !== null && cotizacion !== null
      ? `Equivale a unos ${formatoSats(usdCentavosASats(centavos, cotizacion))}.`
      : '';

  return (
    <form action={accion} className={estilos.formulario} noValidate>
      <div className={estilos.grupo}>
        <label htmlFor="titulo" className="campo-etiqueta">
          Qué necesitás
        </label>
        <input
          id="titulo"
          name="titulo"
          className="campo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={LIMITES.tituloNecesidad.maximo}
          autoComplete="off"
          aria-describedby="titulo-ayuda"
        />
        <p id="titulo-ayuda" className={estilos.ayuda}>
          Entre 4 y 100 caracteres. Por ejemplo: Reparar una fuga en el baño.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label htmlFor="categoria" className="campo-etiqueta">
          Categoría
        </label>
        <select
          id="categoria"
          name="categoria"
          className={`campo ${estilos.select}`}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="">Elegí una categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className={estilos.grupo}>
        <label htmlFor="descripcion" className="campo-etiqueta">
          Descripción
        </label>
        <textarea
          id="descripcion"
          name="descripcion"
          className={`campo ${estilos.textarea}`}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={LIMITES.descripcionNecesidad.maximo}
          aria-describedby="descripcion-contador"
        />
        <p id="descripcion-contador" className={estilos.ayuda}>
          {descripcion.length} de {LIMITES.descripcionNecesidad.maximo} caracteres
        </p>
      </div>

      <div className={estilos.grupo}>
        <label htmlFor="zona" className="campo-etiqueta">
          Zona
        </label>
        <input
          id="zona"
          name="zona"
          className="campo"
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          maxLength={LIMITES.zona.maximo}
          autoComplete="off"
          aria-describedby="zona-ayuda"
        />
        <p id="zona-ayuda" className={estilos.ayuda}>
          Barrio o municipio donde lo necesitás.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label htmlFor="presupuesto" className="campo-etiqueta">
          Presupuesto en dólares (opcional)
        </label>
        <div className={estilos.precio}>
          <span aria-hidden="true">$</span>
          <input
            id="presupuesto"
            name="presupuesto"
            className="campo"
            inputMode="decimal"
            autoComplete="off"
            placeholder="25.50"
            value={presupuesto}
            onChange={(e) => setPresupuesto(e.target.value)}
            aria-describedby="presupuesto-ayuda presupuesto-equivalencia"
          />
        </div>
        <p id="presupuesto-equivalencia" className={estilos.ayuda} aria-live="polite">
          {equivalencia}
        </p>
        <p id="presupuesto-ayuda" className={estilos.ayuda}>
          Si no sabés cuánto cuesta, dejalo vacío.
        </p>
      </div>

      <p className={estilos.aviso}>
        No pongás tu teléfono ni tu dirección exacta. Eso lo coordinás por el chat cuando aceptés una oferta.
      </p>

      {estado.mensaje && (
        <p role="alert" className={estilos.error}>
          {estado.mensaje}
        </p>
      )}

      <button type="submit" className="boton" disabled={pendiente}>
        {pendiente ? 'Publicando…' : 'Publicar necesidad'}
      </button>
    </form>
  );
}

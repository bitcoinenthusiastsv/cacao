'use client';

import { startTransition, useActionState, useState } from 'react';

import { Boton } from '@/componentes/Boton';
import { formatoSats, formatoUsd, usdCentavosASats } from '@/lib/dinero';
import { LIMITES, precioDesdeTexto, type TipoPrecio } from '@/lib/servicios';

import { guardarServicioAccion, type EstadoServicio } from '../acciones';
import type { CategoriaOpcion, DatosFormularioServicio, ValoresServicio } from '../_comun/tipos';
import estilos from '../estilos.module.css';

import { AvisoServicios } from './AvisoServicios';
import { FotoServicio } from './FotoServicio';

// Common units for services; the field still takes any text.
const UNIDADES_COMUNES = ['por corte', 'por hora', 'por viaje', 'por persona', 'por visita'];

const ESTADO_INICIAL: EstadoServicio = {};

type Props = {
  categorias: CategoriaOpcion[];
  /** BTC price in USD, or null when no source answers: the form then shows dollars only. */
  cotizacion: number | null;
  inicial: ValoresServicio;
  /** Why the shop cannot save services now, or null. The save button is off while it is set. */
  motivo: string | null;
};

// One form for new and existing services. The fields are controlled, so a failed save keeps
// what the provider typed. The server checks every field again.
export function FormularioServicio({ categorias, cotizacion, inicial, motivo }: Props) {
  const [estado, despachar, pendiente] = useActionState(guardarServicioAccion, ESTADO_INICIAL);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [categoria, setCategoria] = useState(inicial.categoriaId === null ? '' : String(inicial.categoriaId));
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [zona, setZona] = useState(inicial.zona);
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>(inicial.tipoPrecio);
  const [precio, setPrecio] = useState(inicial.precio);
  const [unidad, setUnidad] = useState(inicial.unidad);
  const [activo, setActivo] = useState(inicial.activo);
  const [fotos, setFotos] = useState(inicial.fotos);
  const [subiendo, setSubiendo] = useState(0);

  const centavos = tipoPrecio === 'fijo' ? precioDesdeTexto(precio) : null;
  const sats = centavos !== null && cotizacion !== null ? usdCentavosASats(centavos, cotizacion) : null;

  let equivalencia = '';
  if (centavos !== null && sats !== null) {
    equivalencia = `Equivale a ${formatoSats(sats)} con la cotización de hoy, a ${formatoUsd(centavos)}.`;
  } else if (tipoPrecio === 'fijo' && cotizacion === null) {
    equivalencia = 'No pudimos leer el precio de bitcoin ahora. Podés guardar igual en dólares.';
  }

  // The price and unit of a quoted service are not sent at all: the fields are not on screen.
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (subiendo > 0 || pendiente || motivo !== null) return;

    const cuerpo: DatosFormularioServicio = {
      id: inicial.id,
      categoria,
      titulo,
      descripcion,
      zona,
      tipoPrecio,
      precio: tipoPrecio === 'fijo' ? precio : null,
      unidad: tipoPrecio === 'fijo' ? unidad : null,
      activo,
      fotos,
    };

    startTransition(() => despachar(cuerpo));
  }

  return (
    <>
      <form className={estilos.formulario} onSubmit={enviar}>
        <AvisoServicios motivo={motivo} id="aviso-servicios" />

        <div className={estilos.grupo}>
          <label className="campo-etiqueta" htmlFor="titulo">
            Título del servicio
          </label>
          <input
            id="titulo"
            name="titulo"
            className="campo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            minLength={LIMITES.tituloServicio.minimo}
            maxLength={LIMITES.tituloServicio.maximo}
            autoComplete="off"
            placeholder="Afeitado clásico"
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
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
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
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={LIMITES.descripcionServicio.maximo}
            aria-describedby="descripcion-contador"
          />
          <p id="descripcion-contador" className={`${estilos.ayuda} ${estilos.contador}`}>
            {Array.from(descripcion).length} de {LIMITES.descripcionServicio.maximo} caracteres
          </p>
        </div>

        <div className={estilos.grupo}>
          <label className="campo-etiqueta" htmlFor="zona">
            Dónde trabajás
          </label>
          <input
            id="zona"
            name="zona"
            className="campo"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            maxLength={LIMITES.zona.maximo}
            autoComplete="off"
            placeholder="Suchitoto y alrededores"
            aria-describedby="zona-ayuda"
          />
          <p id="zona-ayuda" className={estilos.ayuda}>
            Barrio, pueblo o zona donde atendés o llegás.
          </p>
        </div>

        <fieldset className={estilos.grupo}>
          <legend className="campo-etiqueta">Tipo de precio</legend>
          <div className={estilos.tarjetas}>
            <label className={estilos.tarjeta}>
              <input
                type="radio"
                name="tipoPrecio"
                value="fijo"
                checked={tipoPrecio === 'fijo'}
                onChange={() => setTipoPrecio('fijo')}
              />
              Precio fijo
            </label>
            <label className={estilos.tarjeta}>
              <input
                type="radio"
                name="tipoPrecio"
                value="cotizar"
                checked={tipoPrecio === 'cotizar'}
                onChange={() => setTipoPrecio('cotizar')}
              />
              A cotizar: el precio depende del trabajo
            </label>
          </div>
        </fieldset>

        {tipoPrecio === 'fijo' && (
          <>
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
                  name="precio"
                  className={`campo ${estilos.precioCampo}`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="5.50"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  aria-describedby="precio-equivalencia precio-nota"
                  required
                />
              </div>
              <p id="precio-equivalencia" className={`${estilos.ayuda} ${estilos.equivalencia}`} aria-live="polite">
                {equivalencia}
              </p>
              <p id="precio-nota" className={estilos.ayuda}>
                El precio se fija en dólares. Los sats se calculan cuando el cliente paga.
              </p>
            </div>

            <div className={estilos.grupo}>
              <label className="campo-etiqueta" htmlFor="unidad">
                Unidad
              </label>
              <input
                id="unidad"
                name="unidad"
                className="campo"
                list="unidades-servicio"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                maxLength={LIMITES.unidad.maximo}
                autoComplete="off"
                aria-describedby="unidad-ayuda"
                required
              />
              <datalist id="unidades-servicio">
                {UNIDADES_COMUNES.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              <p id="unidad-ayuda" className={estilos.ayuda}>
                Por ejemplo por corte, por hora o por viaje.
              </p>
            </div>
          </>
        )}

        <div className={estilos.grupo}>
          <label className={estilos.casilla}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
          <p className={estilos.ayuda}>Si lo desmarcás, el servicio queda pausado y no aparece en el catálogo.</p>
        </div>

        <FotoServicio
          foto={fotos[0] ?? null}
          onCambiar={(url) => setFotos(url ? [url] : [])}
          onProgreso={(cambio) => setSubiendo((n) => n + cambio)}
        />

        {estado.error && (
          <p className={estilos.error} role="alert">
            {estado.error}
          </p>
        )}
        {subiendo > 0 && (
          <p className={estilos.ayuda} role="status">
            Esperá a que termine de subir la foto para guardar.
          </p>
        )}

        <div className={estilos.acciones}>
          <button
            type="submit"
            className="boton"
            disabled={pendiente || subiendo > 0 || motivo !== null}
            aria-busy={pendiente}
            aria-describedby={motivo !== null ? 'aviso-servicios' : undefined}
          >
            {pendiente ? 'Guardando…' : 'Guardar servicio'}
          </button>
          <Boton href="/mi-negocio/servicios" variante="secundario">
            Cancelar
          </Boton>
        </div>
      </form>

      <p className={estilos.notaCobro}>Cobrás al terminar el trabajo. CacaoMarket no guarda dinero ni cobra por vos.</p>
    </>
  );
}

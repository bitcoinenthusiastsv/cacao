'use client';

import { useActionState, useEffect, useRef } from 'react';

import { ocultarNecesidadAccion } from '../acciones';
import { AccionOcultar } from '../AccionOcultar';
import estilos from '../estilos.module.css';
import { formatoFecha, nombreVisible } from '../etiquetas';
import { ETIQUETA_NECESIDAD } from '@/lib/servicios';

// The page computes the deadline and the budget text on the server, so the browser never
// decides "today" and both renders agree.
export type NecesidadFila = {
  id: string;
  titulo: string;
  autor: string;
  zona: string;
  estado: 'abierta' | 'asignada' | 'cancelada' | 'vencida';
  oculta: boolean;
  creadaEn: string;
  plazo: string;
  presupuesto: string;
};

export function ListaNecesidades({ necesidades }: { necesidades: NecesidadFila[] }) {
  const [resultado, accion] = useActionState(ocultarNecesidadAccion, null);
  const avisoRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (resultado) avisoRef.current?.focus();
  }, [resultado]);

  return (
    <section id="necesidades" className={estilos.bloque} aria-labelledby="titulo-necesidades">
      <h2 id="titulo-necesidades" className={estilos.subtitulo}>
        Necesidades del tablón
      </h2>

      {resultado &&
        (resultado.ok ? (
          <p ref={avisoRef} tabIndex={-1} role="status" className={estilos.mensajeOk}>
            {resultado.dato}
          </p>
        ) : (
          <p ref={avisoRef} tabIndex={-1} role="alert" className={estilos.mensajeError}>
            {resultado.mensaje}
          </p>
        ))}

      {necesidades.length === 0 ? (
        <p className={estilos.vacio}>Todavía no hay necesidades publicadas.</p>
      ) : (
        <div className={estilos.grupo}>
          {necesidades.map((n) => (
            <TarjetaNecesidad key={n.id} necesidad={n} accion={accion} />
          ))}
        </div>
      )}
    </section>
  );
}

function TarjetaNecesidad({
  necesidad: n,
  accion,
}: {
  necesidad: NecesidadFila;
  accion: (datos: FormData) => void;
}) {
  return (
    <article className={estilos.tarjetaGrande} aria-labelledby={`necesidad-${n.id}`}>
      <div className={estilos.cabeceraTarjeta}>
        <h3 id={`necesidad-${n.id}`} className={estilos.nombreTarjeta}>
          {n.titulo}
        </h3>
        <span className={estilos.marcas}>
          <span className={estilos.estado}>{ETIQUETA_NECESIDAD[n.estado]}</span>
          {n.oculta && <span className={`${estilos.estado} ${estilos.estadoAtencion}`}>Oculta</span>}
        </span>
      </div>

      <dl className={estilos.datos}>
        <div>
          <dt>Autor</dt>
          <dd>{nombreVisible(n.autor)}</dd>
        </div>
        <div>
          <dt>Zona</dt>
          <dd>{n.zona || '—'}</dd>
        </div>
        <div>
          <dt>Presupuesto</dt>
          <dd className={estilos.dato}>{n.presupuesto}</dd>
        </div>
        <div>
          <dt>Plazo</dt>
          <dd>{n.plazo}</dd>
        </div>
        <div>
          <dt>Publicada</dt>
          <dd>{formatoFecha(n.creadaEn)}</dd>
        </div>
      </dl>

      <AccionOcultar id={n.id} campo="oculta" titulo={n.titulo} oculto={n.oculta} accion={accion} />
    </article>
  );
}

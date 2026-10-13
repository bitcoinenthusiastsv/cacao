'use client';

import { useActionState, useEffect, useRef } from 'react';

import { ocultarServicioAccion } from '../acciones';
import { AccionOcultar } from '../AccionOcultar';
import estilos from '../estilos.module.css';
import { formatoFecha, nombreVisible } from '../etiquetas';
import { textoPrecio } from '@/lib/servicios';
import type { ServicioAdmin } from '@/servidor/admin';

// One action state for the whole list, as in ListaNegocios: the message stays in view after the
// action, and the card keeps its place because the list order does not change.
export function ListaServicios({ servicios }: { servicios: ServicioAdmin[] }) {
  const [resultado, accion] = useActionState(ocultarServicioAccion, null);
  const avisoRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (resultado) avisoRef.current?.focus();
  }, [resultado]);

  return (
    <section className={estilos.bloque} aria-labelledby="titulo-servicios">
      <h2 id="titulo-servicios" className={estilos.subtitulo}>
        Servicios publicados
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

      {servicios.length === 0 ? (
        <p className={estilos.vacio}>Todavía no hay servicios publicados.</p>
      ) : (
        <div className={estilos.grupo}>
          {servicios.map((s) => (
            <TarjetaServicio key={s.id} servicio={s} accion={accion} />
          ))}
        </div>
      )}
    </section>
  );
}

function TarjetaServicio({
  servicio: s,
  accion,
}: {
  servicio: ServicioAdmin;
  accion: (datos: FormData) => void;
}) {
  return (
    <article className={estilos.tarjetaGrande} aria-labelledby={`servicio-${s.id}`}>
      <div className={estilos.cabeceraTarjeta}>
        <h3 id={`servicio-${s.id}`} className={estilos.nombreTarjeta}>
          {s.titulo}
        </h3>
        <span className={estilos.marcas}>
          {!s.activo && <span className={estilos.estado}>Pausado</span>}
          {s.oculto && <span className={`${estilos.estado} ${estilos.estadoAtencion}`}>Oculto</span>}
        </span>
      </div>

      <dl className={estilos.datos}>
        <div>
          <dt>Negocio</dt>
          <dd>{s.negocio || '—'}</dd>
        </div>
        <div>
          <dt>Dueño</dt>
          <dd>{nombreVisible(s.dueno)}</dd>
        </div>
        <div>
          <dt>Zona</dt>
          <dd>{s.zona || '—'}</dd>
        </div>
        <div>
          <dt>Precio</dt>
          <dd>{textoPrecio(s)}</dd>
        </div>
        <div>
          <dt>Publicado</dt>
          <dd>{formatoFecha(s.creadoEn)}</dd>
        </div>
      </dl>

      <AccionOcultar id={s.id} campo="oculto" titulo={s.titulo} oculto={s.oculto} accion={accion} />
    </article>
  );
}

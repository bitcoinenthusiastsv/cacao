'use client';

import { useActionState, useEffect, useRef } from 'react';

import { cambiarEstadoNegocioAccion } from '../acciones';
import estilos from '../estilos.module.css';
import {
  ETIQUETA_NEGOCIO,
  ETIQUETA_PROVEEDOR,
  type EstadoNegocio,
  formatoFecha,
  nombreVisible,
} from '../etiquetas';
import type { NegocioAdmin } from '@/servidor/admin';
import { AccionesNegocio } from './AccionesNegocio';

const GRUPOS: { estado: EstadoNegocio; titulo: string }[] = [
  { estado: 'pendiente', titulo: 'Por aprobar' },
  { estado: 'aprobado', titulo: 'Aprobados' },
  { estado: 'suspendido', titulo: 'Suspendidos' },
];

// One state for the whole list. A shop moves between groups after each change, and a card
// that moves is remounted, so its own action state would be lost before the message shows.
export function ListaNegocios({ negocios }: { negocios: NegocioAdmin[] }) {
  const [resultado, accion] = useActionState(cambiarEstadoNegocioAccion, null);
  const avisoRef = useRef<HTMLParagraphElement>(null);

  // Bring the answer into view: on a phone the list is long.
  useEffect(() => {
    if (resultado) avisoRef.current?.focus();
  }, [resultado]);

  return (
    <>
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

      {GRUPOS.map((grupo) => {
        const lista = negocios.filter((n) => n.estado === grupo.estado);
        return (
          <section key={grupo.estado} className={estilos.bloque} aria-labelledby={`grupo-${grupo.estado}`}>
            <h3 id={`grupo-${grupo.estado}`} className={estilos.subtitulo}>
              {grupo.titulo} ({lista.length})
            </h3>
            {lista.length === 0 ? (
              <p className={estilos.vacio}>Ninguno por ahora.</p>
            ) : (
              <div className={estilos.grupo}>
                {lista.map((n) => (
                  <TarjetaNegocio key={n.id} negocio={n} accion={accion} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function TarjetaNegocio({
  negocio: n,
  accion,
}: {
  negocio: NegocioAdmin;
  accion: (datos: FormData) => void;
}) {
  return (
    <article className={estilos.tarjetaGrande} aria-labelledby={`negocio-${n.id}`}>
      <div className={estilos.cabeceraTarjeta}>
        <h4 id={`negocio-${n.id}`} className={estilos.nombreTarjeta}>
          {n.nombre}
        </h4>
        <span className={estilos.estado}>{ETIQUETA_NEGOCIO[n.estado]}</span>
      </div>

      <dl className={estilos.datos}>
        <div>
          <dt>Dueño</dt>
          <dd>{nombreVisible(n.dueno)}</dd>
        </div>
        <div>
          <dt>Contacto</dt>
          <dd className={estilos.dato}>{n.contacto || '—'}</dd>
        </div>
        <div>
          <dt>Ubicación</dt>
          <dd>{n.ubicacion || '—'}</dd>
        </div>
        <div>
          <dt>Tipo de cobro</dt>
          <dd>{ETIQUETA_PROVEEDOR[n.tipoProveedorPago] ?? n.tipoProveedorPago}</dd>
        </div>
        <div>
          <dt>Lightning Address</dt>
          <dd className={estilos.dato}>{n.lightningAddress ?? 'Sin cargar'}</dd>
        </div>
        <div>
          <dt>Registrado</dt>
          <dd>{formatoFecha(n.creadoEn)}</dd>
        </div>
        <div className={estilos.ancho}>
          <dt>Descripción</dt>
          <dd className={estilos.textoLargo}>{n.descripcion || 'Sin descripción'}</dd>
        </div>
      </dl>

      <AccionesNegocio negocioId={n.id} nombre={n.nombre} estado={n.estado} accion={accion} />
    </article>
  );
}

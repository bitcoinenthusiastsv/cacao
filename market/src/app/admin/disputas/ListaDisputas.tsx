'use client';

import Link from 'next/link';
import { type FormEvent, startTransition, useActionState, useEffect, useId, useState } from 'react';

import { resolverDisputaAccion } from '../acciones';
import estilos from '../estilos.module.css';
import { ETIQUETA_RESULTADO, formatoFecha, montoExacto, nombreVisible, type ResultadoDisputa } from '../etiquetas';
import type { DisputaAdmin } from '@/servidor/admin';

// A dispute with the results its order allows. Open ones carry them; resolved ones do not need them.
export type DisputaParaResolver = DisputaAdmin & {
  resultados: ResultadoDisputa[];
  // A job never paid: its two results mean owed or not owed, and the form explains that.
  sinPagar: boolean;
};

// One action state for the list. A resolved dispute moves to the bottom of the list and its card
// is remounted, so the answer is kept here and shown in the card that was submitted.
export function ListaDisputas({ disputas }: { disputas: DisputaParaResolver[] }) {
  const [resultado, accion, enCurso] = useActionState(resolverDisputaAccion, null);
  const [ordenEnviada, setOrdenEnviada] = useState<string | null>(null);

  useEffect(() => {
    if (resultado && ordenEnviada) document.getElementById(`aviso-${ordenEnviada}`)?.focus();
  }, [resultado, ordenEnviada]);

  // Not a form action: React resets form fields after an action, which would clear what the
  // admin typed when the server refuses the note.
  function enviar(ordenId: string, datos: FormData) {
    setOrdenEnviada(ordenId);
    startTransition(() => accion(datos));
  }

  return (
    <div className={estilos.grupo}>
      {disputas.map((d) => (
        <TarjetaDisputa
          key={d.id}
          disputa={d}
          enCurso={enCurso}
          aviso={resultado && ordenEnviada === d.ordenId ? resultado : null}
          onEnviar={enviar}
        />
      ))}
    </div>
  );
}

type Aviso = { ok: true; dato: string } | { ok: false; codigo: string; mensaje: string };

function TarjetaDisputa({
  disputa: d,
  enCurso,
  aviso,
  onEnviar,
}: {
  disputa: DisputaParaResolver;
  enCurso: boolean;
  aviso: Aviso | null;
  onEnviar: (ordenId: string, datos: FormData) => void;
}) {
  const abierta = d.estado === 'abierta';

  return (
    <article className={estilos.tarjetaGrande} aria-labelledby={`disputa-${d.id}`}>
      <div className={estilos.cabeceraTarjeta}>
        <h3 id={`disputa-${d.id}`} className={estilos.nombreTarjeta}>
          <Link href={`/admin/ordenes/${d.ordenId}`}>Orden {d.numero}</Link>
        </h3>
        <span className={abierta ? `${estilos.estado} ${estilos.estadoAtencion}` : `${estilos.estado} ${estilos.estadoCerrado}`}>
          {abierta ? 'Abierta' : 'Resuelta'}
        </span>
      </div>

      <dl className={estilos.datos}>
        <div>
          <dt>Comprador</dt>
          <dd>{nombreVisible(d.comprador)}</dd>
        </div>
        <div>
          <dt>Negocio</dt>
          <dd>{d.negocio || '—'}</dd>
        </div>
        <div>
          <dt>Total de la orden</dt>
          <dd className={estilos.dato}>{montoExacto(d.totalSats, d.totalUsdCentavos)}</dd>
        </div>
        <div>
          <dt>Abierta</dt>
          <dd>{formatoFecha(d.creadaEn)}</dd>
        </div>
        <div className={estilos.ancho}>
          <dt>Motivo</dt>
          <dd className={estilos.textoLargo}>{d.motivo}</dd>
        </div>
        <div className={estilos.ancho}>
          <dt>Evidencia</dt>
          <dd className={estilos.textoLargo}>{d.evidencia || 'Sin evidencia'}</dd>
        </div>
      </dl>

      {abierta ? (
        <FormularioResolver
          ordenId={d.ordenId}
          resultados={d.resultados}
          sinPagar={d.sinPagar}
          enCurso={enCurso}
          aviso={aviso}
          onEnviar={onEnviar}
        />
      ) : (
        <>
          {aviso && <Mensaje aviso={aviso} id={`aviso-${d.ordenId}`} />}
          <dl className={estilos.datos}>
            <div>
              <dt>Resultado</dt>
              <dd>{d.resultado ? ETIQUETA_RESULTADO[d.resultado] : '—'}</dd>
            </div>
            <div>
              <dt>Resuelta</dt>
              <dd>{formatoFecha(d.resueltaEn)}</dd>
            </div>
            <div className={estilos.ancho}>
              <dt>Nota de resolución</dt>
              <dd className={estilos.textoLargo}>{d.notaResolucion || '—'}</dd>
            </div>
            {(d.resultado === 'reembolso_total' || d.resultado === 'reembolso_parcial') && (
              <>
                <div className={estilos.ancho}>
                  <dt>Reembolso marcado por el vendedor</dt>
                  <dd>{d.reembolsoMarcadoEn ? formatoFecha(d.reembolsoMarcadoEn) : 'Todavía no lo marcó'}</dd>
                </div>
                <div className={estilos.ancho}>
                  <dt>Reembolso confirmado por el comprador</dt>
                  <dd>{d.reembolsoConfirmadoEn ? formatoFecha(d.reembolsoConfirmadoEn) : 'Todavía no lo confirmó'}</dd>
                </div>
              </>
            )}
          </dl>
        </>
      )}
    </article>
  );
}

function Mensaje({ aviso, id }: { aviso: Aviso; id: string }) {
  return aviso.ok ? (
    <p id={id} tabIndex={-1} role="status" className={estilos.mensajeOk}>
      {aviso.dato}
    </p>
  ) : (
    <p id={id} tabIndex={-1} role="alert" className={estilos.mensajeError}>
      {aviso.mensaje}
    </p>
  );
}

// Resolves an open dispute. The server checks the admin role, the result and the note length.
function FormularioResolver({
  ordenId,
  resultados,
  sinPagar,
  enCurso,
  aviso,
  onEnviar,
}: {
  ordenId: string;
  resultados: ResultadoDisputa[];
  sinPagar: boolean;
  enCurso: boolean;
  aviso: Aviso | null;
  onEnviar: (ordenId: string, datos: FormData) => void;
}) {
  const id = useId();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    onEnviar(ordenId, new FormData(evento.currentTarget));
  }

  return (
    <form onSubmit={enviar} noValidate className={estilos.formulario}>
      <input type="hidden" name="orden" value={ordenId} />

      <fieldset className={estilos.opciones}>
        <legend>Resultado</legend>
        {resultados.map((r) => (
          <label key={r} className={estilos.opcion}>
            <input type="radio" name="resultado" value={r} />
            {ETIQUETA_RESULTADO[r]}
          </label>
        ))}
      </fieldset>

      <div className={estilos.campo}>
        <label htmlFor={`${id}-nota`} className="campo-etiqueta">
          Nota de resolución
        </label>
        <textarea
          id={`${id}-nota`}
          name="nota"
          maxLength={1000}
          className={estilos.areaTexto}
          aria-describedby={`${id}-ayuda`}
          aria-required="true"
        />
        <p id={`${id}-ayuda`} className={estilos.ayuda}>
          Entre 10 y 1000 caracteres. El comprador y el vendedor la ven.
        </p>
      </div>

      <p className={estilos.explicacion}>
        {sinPagar
          ? 'Si corresponde pagar, el trabajo vuelve a quedar por cobrar. Si no corresponde, el trabajo se cancela.'
          : 'CacaoMarket no mueve dinero. Si la resolución pide reembolso, el vendedor lo paga desde su billetera y el comprador lo confirma.'}
      </p>

      {aviso && <Mensaje aviso={aviso} id={`aviso-${ordenId}`} />}

      <div className={estilos.acciones}>
        <button type="submit" className="boton" disabled={enCurso} aria-disabled={enCurso || undefined}>
          {enCurso ? 'Resolviendo…' : 'Resolver disputa'}
        </button>
      </div>
    </form>
  );
}

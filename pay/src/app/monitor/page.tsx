import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';

import tabla from '@/componentes/Tabla.module.css';
import { formatoUsd } from '@/lib/dinero';
import { ETIQUETA_ESTADO, type EstadoEnvio } from '@/lib/transferencias';
import { resumenEnvios, type ResumenEstado } from '@/servidor/monitor';
import { exigirAdmin } from '@/servidor/sesion';

import { FiltroPeriodo } from './FiltroPeriodo';
import { periodoDe } from './periodo';
import estilos from './estilos.module.css';

export const metadata: Metadata = {
  title: 'Resumen',
};

export default function PaginaResumen(props: PageProps<'/monitor'>) {
  return (
    <Suspense fallback={<p role="status">Cargando el resumen…</p>}>
      <Resumen busqueda={props.searchParams} />
    </Suspense>
  );
}

// The order of the rows is the order of a transfer's life.
const ORDEN: EstadoEnvio[] = ['creada', 'procesando', 'completada', 'fallida', 'cancelada'];

async function Resumen({ busqueda }: { busqueda: PageProps<'/monitor'>['searchParams'] }) {
  await connection();
  const params = await busqueda;
  const sesion = await exigirAdmin('/monitor');
  const periodo = periodoDe(params, new Date());
  const resultado = await resumenEnvios(sesion.usuario.id, periodo.inicio, periodo.fin);

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-resumen">
      <div className={estilos.encabezadoSeccion}>
        <h2 id="titulo-resumen">Resumen del período</h2>
        <p className={estilos.leyenda}>
          Cuenta los envíos creados desde el {periodo.desde} hasta el {periodo.hasta}, los dos días incluidos.
        </p>
      </div>

      <FiltroPeriodo ruta="/monitor" desde={periodo.desde} hasta={periodo.hasta} aviso={periodo.aviso} />

      {resultado.ok ? (
        <ResumenContenido filas={resultado.dato} />
      ) : (
        <p role="alert" className={estilos.error}>
          {resultado.mensaje}
        </p>
      )}
    </section>
  );
}

function ResumenContenido({ filas }: { filas: ResumenEstado[] }) {
  const porEstado = (estado: EstadoEnvio) => filas.find((f) => f.estado === estado);
  const total = filas.reduce((suma, f) => suma + f.cantidad, 0);
  const montoTotal = filas.reduce((suma, f) => suma + f.montoOrigenUsdCentavos, 0);
  const comisionTotal = filas.reduce((suma, f) => suma + f.comisionUsdCentavos, 0);
  const completados = porEstado('completada')?.cantidad ?? 0;
  // Every transfer created in the period counts, so a transfer still on its way lowers the share.
  const decadas = total === 0 ? null : Math.round((completados / total) * 10);

  return (
    <>
      <div className={estilos.cifrasResumen}>
        <div className={estilos.cifra}>
          <span>Envíos</span>
          <span className={estilos.cifraNumero}>{total}</span>
        </div>
        <div className={estilos.cifra}>
          <span>Enviado (USD)</span>
          <span className={estilos.cifraNumero}>{formatoUsd(montoTotal)}</span>
        </div>
        <div className={estilos.cifra}>
          <span>Comisiones (USD)</span>
          <span className={estilos.cifraNumero}>{formatoUsd(comisionTotal)}</span>
        </div>
        <div className={estilos.cifra}>
          <span>Entregados</span>
          <span className={estilos.cifraNumero}>{completados}</span>
        </div>
      </div>

      {decadas === null ? (
        <p className={estilos.frase}>Todavía no hay envíos en este período.</p>
      ) : (
        <p className={estilos.frase}>{`${decadas} de cada 10 envíos se completan.`}</p>
      )}

      <div className={tabla.envoltura}>
        <table className={tabla.tabla}>
          <caption className={tabla.leyenda}>Envíos por estado</caption>
          <thead>
            <tr>
              <th scope="col">Estado</th>
              <th scope="col">Envíos</th>
              <th scope="col">Enviado (USD)</th>
              <th scope="col">Comisiones (USD)</th>
            </tr>
          </thead>
          <tbody>
            {ORDEN.map((estado) => {
              const fila = porEstado(estado);
              return (
                <tr key={estado}>
                  <th scope="row">{ETIQUETA_ESTADO[estado]}</th>
                  <td data-etiqueta="Envíos">{fila?.cantidad ?? 0}</td>
                  <td data-etiqueta="Enviado (USD)">{formatoUsd(fila?.montoOrigenUsdCentavos ?? 0)}</td>
                  <td data-etiqueta="Comisiones (USD)">{formatoUsd(fila?.comisionUsdCentavos ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td data-etiqueta="Envíos">{total}</td>
              <td data-etiqueta="Enviado (USD)">{formatoUsd(montoTotal)}</td>
              <td data-etiqueta="Comisiones (USD)">{formatoUsd(comisionTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

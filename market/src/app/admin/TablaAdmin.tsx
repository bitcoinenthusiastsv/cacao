import type { ReactNode } from 'react';

import estilos from './estilos.module.css';

export type FilaTabla = { clave: string; celdas: ReactNode[] };

// One data set, two layouts: stacked cards on phones, a real table from 720px up.
// Both are in the HTML and CSS shows one. The first column is the row title in both.
export function TablaAdmin({
  titulo,
  encabezados,
  filas,
}: {
  titulo: string;
  encabezados: string[];
  filas: FilaTabla[];
}) {
  return (
    <>
      <ul className={estilos.tarjetas}>
        {filas.map((fila) => (
          <li key={fila.clave} className={estilos.tarjeta}>
            <div className={estilos.tarjetaTitulo}>{fila.celdas[0]}</div>
            <dl className={estilos.tarjetaDatos}>
              {encabezados.slice(1).map((encabezado, i) => (
                <div key={encabezado} className={estilos.tarjetaDato}>
                  <dt>{encabezado}</dt>
                  <dd>{fila.celdas[i + 1]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className={estilos.tablaWrap}>
        <table className={estilos.tabla}>
          <caption className={estilos.leyenda}>{titulo}</caption>
          <thead>
            <tr>
              {encabezados.map((encabezado) => (
                <th key={encabezado} scope="col">
                  {encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.clave}>
                {fila.celdas.map((celda, i) =>
                  i === 0 ? (
                    <th key={i} scope="row">
                      {celda}
                    </th>
                  ) : (
                    <td key={i}>{celda}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

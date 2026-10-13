import type { Metadata } from 'next';

import { EtiquetaPrecio } from '@/componentes/EtiquetaPrecio';
import { usdCentavosASats } from '@/lib/dinero';
import { embudoAdmin } from '@/servidor/admin';
import { cotizacionSegura } from '@/servidor/catalogo';
import { exigirAdmin } from '@/servidor/sesion';

import estilos from '../estilos.module.css';

import estilosEmbudo from './embudo.module.css';
import { rangoDesde } from './rango';

export const metadata: Metadata = {
  title: 'Embudo',
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valor(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// "14 sep 2026" for a day in El Salvador. Read at noon UTC so the day never shifts.
const formatoDia = new Intl.DateTimeFormat('es-SV', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function dia(fecha: string): string {
  return formatoDia.format(new Date(`${fecha}T12:00:00Z`));
}

export default async function PaginaEmbudo(props: Props) {
  const sesion = await exigirAdmin();
  const params = await props.searchParams;
  const rango = rangoDesde(valor(params.desde), valor(params.hasta));
  const [pasos, cotizacion] = await Promise.all([
    embudoAdmin(sesion.usuario.id, rango.desde, rango.hasta),
    cotizacionSegura(),
  ]);

  const primero = pasos[0]?.sesiones ?? 0;
  const vistas = pasos.find((p) => p.nombre === 'vista_producto')?.sesiones ?? 0;
  const pago = pasos.find((p) => p.nombre === 'pago');
  const pagaron = pago?.sesiones ?? 0;
  const valorPagado = pago?.valorUsdCentavos ?? 0;
  const porCien = vistas > 0 ? Math.round((pagaron * 100) / vistas) : null;
  const lectura =
    porCien === null
      ? 'Todavía no hay visitas a productos en este periodo.'
      : `De cada 100 personas que ven un producto, ${porCien} pagan.`;

  return (
    <section className={estilos.bloque} aria-labelledby="titulo-embudo">
      <h2 id="titulo-embudo" className={estilos.subtitulo}>
        Embudo de compra
      </h2>
      <p className={estilos.descripcion}>
        Cuántas sesiones llegaron a cada paso, de ver un producto a pagarlo. Una sesión cuenta una vez por paso
        y por hora.
      </p>

      <form method="get" action="/admin/embudo" className={estilosEmbudo.filtros}>
        <div className={estilosEmbudo.campo}>
          <label htmlFor="desde" className="campo-etiqueta">
            Desde
          </label>
          <input id="desde" name="desde" type="date" className="campo" defaultValue={rango.desdeFecha} />
        </div>
        <div className={estilosEmbudo.campo}>
          <label htmlFor="hasta" className="campo-etiqueta">
            Hasta
          </label>
          <input id="hasta" name="hasta" type="date" className="campo" defaultValue={rango.hastaFecha} />
        </div>
        <button type="submit" className="boton">
          Ver periodo
        </button>
      </form>

      {rango.aviso && (
        <p role="alert" className={estilosEmbudo.aviso}>
          {rango.aviso}
        </p>
      )}

      <p className={estilos.ayuda}>
        Del {dia(rango.desdeFecha)} al {dia(rango.hastaFecha)}, hora de El Salvador.
      </p>

      {pasos.length === 0 ? (
        <p className={estilos.vacio}>No hay pasos configurados para el embudo.</p>
      ) : (
        <ol className={estilosEmbudo.pasos}>
          {pasos.map((paso, indice) => {
            const anterior = indice === 0 ? null : pasos[indice - 1];
            const porcentaje =
              anterior === null ? null : anterior.sesiones > 0 ? Math.round((paso.sesiones * 100) / anterior.sesiones) : 0;
            const ancho = primero > 0 ? Math.round((paso.sesiones * 100) / primero) : 0;
            return (
              <li key={paso.nombre} className={estilosEmbudo.paso}>
                <div className={estilosEmbudo.encabezado}>
                  <span className={estilosEmbudo.etiqueta}>{paso.etiqueta}</span>
                  <span className={`dato ${estilosEmbudo.cifra}`}>
                    {paso.sesiones} {paso.sesiones === 1 ? 'sesión' : 'sesiones'}
                  </span>
                </div>
                <div className={estilosEmbudo.barra} aria-hidden="true">
                  <span style={{ width: `${ancho}%` }} />
                </div>
                <p className={estilosEmbudo.porcentaje}>
                  {porcentaje === null ? 'Primer paso del embudo' : `${porcentaje}% del paso anterior`}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      <p className={estilosEmbudo.lectura}>{lectura}</p>

      <div className={estilosEmbudo.valor}>
        <h3 className={estilos.subtitulo}>Total pagado en el periodo</h3>
        {valorPagado > 0 ? (
          <>
            <EtiquetaPrecio
              usdCentavos={valorPagado}
              sats={cotizacion === null ? null : usdCentavosASats(valorPagado, cotizacion)}
            />
            {cotizacion !== null && (
              <p className={estilos.ayuda}>
                Los sats son aproximados: se calculan con el precio de bitcoin de hoy.
              </p>
            )}
          </>
        ) : (
          <p className={estilos.vacio}>Todavía no hay pagos en este periodo.</p>
        )}
      </div>
    </section>
  );
}

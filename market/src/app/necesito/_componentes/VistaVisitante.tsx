import Link from 'next/link';

import { retirarCotizacionAccion } from '@/app/cotizaciones/acciones';
import { ETIQUETA_COTIZACION } from '@/lib/servicios';
import type { NecesidadParaUsuario } from '@/servidor/necesidades';

import { fechaCorta, precioAprox } from '../_comun/formato';
import estilos from '../estilos.module.css';

import { BotonAccion } from './BotonAccion';
import { FormularioOferta } from './FormularioOferta';

// What a signed-in visitor who is not the author sees: their own offer if they made one, and the form
// when their shop may offer. The motivo sentence says why not, when it may not.
export function VistaVisitante({
  vista,
  cotizacion,
}: {
  vista: NecesidadParaUsuario;
  cotizacion: number | null;
}) {
  const { necesidad, miOferta, puedeOfertar, motivoNoPuedeOfertar } = vista;

  return (
    <section aria-labelledby="oferta-titulo" className={estilos.bloque}>
      <h2 id="oferta-titulo">{miOferta ? 'Tu oferta' : 'Ofertar'}</h2>

      {miOferta && (
        <article className={estilos.oferta}>
          {miOferta.precioUsdCentavos !== null && (
            <p className={estilos.precioOferta}>{precioAprox(miOferta.precioUsdCentavos, cotizacion)}</p>
          )}
          {miOferta.mensaje && <p className={estilos.mensaje}>{miOferta.mensaje}</p>}
          <p className={estilos.ayuda}>
            {fechaCorta(miOferta.creadaEn)} · {ETIQUETA_COTIZACION[miOferta.estado]}
          </p>
          <BotonAccion
            accion={retirarCotizacionAccion}
            campos={{ cotizacionId: miOferta.id }}
            etiqueta="Retirar mi oferta"
            variante="secundario"
            confirmacion={{
              texto: 'Si la retirás, el autor no puede aceptarla. Después podés volver a ofertar.',
              etiquetaConfirmar: 'Sí, retirar mi oferta',
            }}
            disponible={miOferta.estado === 'ofrecida'}
          />
        </article>
      )}

      {puedeOfertar && <FormularioOferta necesidadId={necesidad.id} cotizacion={cotizacion} />}

      {!puedeOfertar && motivoNoPuedeOfertar && (
        <div className={estilos.bloque}>
          <p>{motivoNoPuedeOfertar}</p>
          {/* Only approved shops can offer; the way to get approved is the shop panel. */}
          {motivoNoPuedeOfertar.includes('aprobados') && (
            <p>
              <Link href="/mi-negocio">Ir a mi negocio</Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

import type { Necesidad } from '@/servidor/necesidades';
import { ETIQUETA_NECESIDAD } from '@/lib/servicios';

import { precioAprox, textoDias, textoOfertas, textoPublicador } from '../_comun/formato';
import estilos from '../estilos.module.css';

// The need itself, the same for every visitor: what it is, who posted it and how many offers it has.
export function FichaNecesidad({ necesidad, cotizacion }: { necesidad: Necesidad; cotizacion: number | null }) {
  return (
    <section aria-labelledby="necesidad-titulo" className={estilos.ficha}>
      <p className={estilos.categoria}>{necesidad.categoriaNombre}</p>
      <h1 id="necesidad-titulo" className={estilos.tituloGrande}>
        {necesidad.titulo}
      </h1>
      <p className={estilos.meta}>
        <span>{necesidad.zona}</span>
        <span>{textoPublicador(necesidad.autorNombre)}</span>
      </p>
      <p className={estilos.meta}>
        <span>{ETIQUETA_NECESIDAD[necesidad.estado]}</span>
        {necesidad.estado === 'abierta' && <span>{textoDias(necesidad.diasRestantes)}</span>}
        <span>{textoOfertas(necesidad.ofertasAbiertas)}</span>
      </p>
      {necesidad.presupuestoUsdCentavos !== null && (
        <p>Presupuesto: {precioAprox(necesidad.presupuestoUsdCentavos, cotizacion)}</p>
      )}
      {necesidad.descripcion && <p className={estilos.descripcion}>{necesidad.descripcion}</p>}
    </section>
  );
}

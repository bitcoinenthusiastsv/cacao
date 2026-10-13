import Link from 'next/link';

import type { Necesidad } from '@/servidor/necesidades';

import { precioAprox, textoDias, textoOfertas, textoPublicador } from '../_comun/formato';
import estilos from '../estilos.module.css';

// One need on the board. Everything here is public, so the author's name is the first name only.
export function TarjetaNecesidad({ necesidad, cotizacion }: { necesidad: Necesidad; cotizacion: number | null }) {
  return (
    <article className={estilos.tarjeta} aria-labelledby={`necesidad-${necesidad.id}`}>
      <p className={estilos.categoria}>{necesidad.categoriaNombre}</p>
      <h2 id={`necesidad-${necesidad.id}`} className={estilos.titulo}>
        <Link href={`/necesito/${necesidad.id}`}>{necesidad.titulo}</Link>
      </h2>
      <p className={estilos.meta}>
        <span>{necesidad.zona}</span>
        <span>{textoDias(necesidad.diasRestantes)}</span>
      </p>
      {necesidad.presupuestoUsdCentavos !== null && (
        <p>Presupuesto: {precioAprox(necesidad.presupuestoUsdCentavos, cotizacion)}</p>
      )}
      <p className={estilos.meta}>
        <span>{textoPublicador(necesidad.autorNombre)}</span>
        <span>{textoOfertas(necesidad.ofertasAbiertas)}</span>
      </p>
    </article>
  );
}

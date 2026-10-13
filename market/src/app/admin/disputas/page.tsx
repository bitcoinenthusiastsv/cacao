import type { Metadata } from 'next';

import { resultadosPosibles } from '@/lib/estados';
import { disputasAdmin, ordenDetalleAdmin } from '@/servidor/admin';
import { exigirAdmin } from '@/servidor/sesion';

import estilos from '../estilos.module.css';
import { ListaDisputas, type DisputaParaResolver } from './ListaDisputas';

export const metadata: Metadata = {
  title: 'Disputas',
};

export default async function PaginaDisputas() {
  const sesion = await exigirAdmin();
  const disputas = await disputasAdmin(sesion.usuario.id);

  // The dispute rows do not carry the order's type or paid state. Each open dispute reads its
  // order here, so the form offers only the results that fit it. The server checks the same rule.
  const paraResolver: DisputaParaResolver[] = await Promise.all(
    disputas.map(async (d) => {
      if (d.estado !== 'abierta') return { ...d, resultados: [], sinPagar: false };
      const orden = await ordenDetalleAdmin(sesion.usuario.id, d.ordenId);
      const pagada = orden?.pagadaEn != null;
      const tipo = orden?.tipo ?? 'productos';
      return {
        ...d,
        resultados: resultadosPosibles({ tipo, pagada }),
        sinPagar: tipo === 'servicio' && !pagada,
      };
    }),
  );

  return (
    <>
      <section className={estilos.bloque} aria-labelledby="titulo-disputas">
        <h2 id="titulo-disputas" className={estilos.subtitulo}>
          Disputas
        </h2>
        <p className={estilos.descripcion}>
          Las abiertas van primero, la más antigua arriba. Resolvé cada una con una nota que explique la decisión.
        </p>
      </section>

      {paraResolver.length === 0 ? (
        <p className={estilos.vacio}>No hay disputas todavía.</p>
      ) : (
        <ListaDisputas disputas={paraResolver} />
      )}
    </>
  );
}

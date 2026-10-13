import type { Metadata } from 'next';

import { formatoSats, formatoUsd, usdCentavosASats } from '@/lib/dinero';
import { diasRestantes } from '@/lib/servicios';
import { necesidadesAdmin, type NecesidadAdmin, serviciosAdmin } from '@/servidor/admin';
import { cotizacionSegura } from '@/servidor/catalogo';
import { exigirAdmin } from '@/servidor/sesion';

import estilos from '../estilos.module.css';
import { ListaNecesidades, type NecesidadFila } from './ListaNecesidades';
import { ListaServicios } from './ListaServicios';

export const metadata: Metadata = {
  title: 'Servicios',
};

export default async function PaginaServicios() {
  const sesion = await exigirAdmin();
  const [servicios, necesidades, cotizacion] = await Promise.all([
    serviciosAdmin(sesion.usuario.id),
    necesidadesAdmin(sesion.usuario.id),
    cotizacionSegura(),
  ]);

  const ahora = new Date();
  const filas: NecesidadFila[] = necesidades.map((n) => ({
    id: n.id,
    titulo: n.titulo,
    autor: n.autor,
    zona: n.zona,
    estado: n.estado,
    oculta: n.oculta,
    creadaEn: n.creadaEn,
    plazo: textoPlazo(n, ahora),
    presupuesto: textoPresupuesto(n.presupuestoUsdCentavos, cotizacion),
  }));

  return (
    <>
      <section className={estilos.bloque} aria-labelledby="titulo-servicios-admin">
        <h2 id="titulo-servicios-admin" className={estilos.subtitulo}>
          Servicios y necesidades
        </h2>
        <p className={estilos.descripcion}>
          Ocultar quita la publicación de la vista de todos, menos de quien la hizo. No borra nada.
        </p>
      </section>

      <ListaServicios servicios={servicios} />
      <ListaNecesidades necesidades={filas} />
    </>
  );
}

// Open needs show the days left; a need past its deadline is expired. Other states have no deadline to show.
function textoPlazo(necesidad: NecesidadAdmin, ahora: Date): string {
  if (necesidad.estado === 'vencida') return 'Vencida';
  if (necesidad.estado !== 'abierta') return '—';
  const dias = diasRestantes(necesidad.venceEn, ahora);
  if (dias === 0) return 'Vencida';
  return dias === 1 ? 'Queda 1 día' : `Quedan ${dias} días`;
}

// Budgets are typed in dollars. The sats figure comes from today's quote, so it is marked "aprox.".
function textoPresupuesto(centavos: number | null, cotizacionUsdBtc: number | null): string {
  if (centavos === null) return 'Sin presupuesto';
  const usd = formatoUsd(centavos);
  if (cotizacionUsdBtc === null) return `${usd} · sin precio de bitcoin ahora`;
  return `${usd} · aprox. ${formatoSats(usdCentavosASats(centavos, cotizacionUsdBtc))}`;
}

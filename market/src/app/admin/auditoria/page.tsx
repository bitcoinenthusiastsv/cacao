import type { Metadata } from 'next';

import { formatoFecha, nombreVisible } from '@/app/admin/etiquetas';
import { auditoriaAdmin } from '@/servidor/admin';
import { exigirAdmin } from '@/servidor/sesion';

import estilos from '../estilos.module.css';
import { TablaAdmin } from '../TablaAdmin';

export const metadata: Metadata = {
  title: 'Auditoría',
};

export default async function PaginaAuditoria() {
  const sesion = await exigirAdmin();
  const filas = await auditoriaAdmin(sesion.usuario.id);

  return (
    <>
      <section className={estilos.bloque} aria-labelledby="titulo-auditoria">
        <h2 id="titulo-auditoria" className={estilos.subtitulo}>
          Auditoría
        </h2>
        <p className={estilos.descripcion}>
          Las últimas 100 acciones: cada cambio de estado de una orden y cada decisión del administrador.
        </p>
      </section>

      {filas.length === 0 ? (
        <p className={estilos.vacio}>Todavía no hay acciones registradas.</p>
      ) : (
        <TablaAdmin
          titulo="Últimas acciones registradas"
          encabezados={['Cuándo', 'Quién', 'Acción', 'Referencia', 'Detalle']}
          filas={filas.map((f) => ({
            clave: String(f.id),
            celdas: [
              formatoFecha(f.creadoEn),
              f.quien === null ? 'Sistema' : nombreVisible(f.quien),
              f.etiqueta,
              f.referencia ?? '—',
              f.detalle.length === 0 ? (
                '—'
              ) : (
                <ul key="d" className={estilos.detalleClaves}>
                  {f.detalle.map((d) => (
                    <li key={d.clave}>
                      {d.clave}: {d.valor}
                    </li>
                  ))}
                </ul>
              ),
            ],
          }))}
        />
      )}
    </>
  );
}

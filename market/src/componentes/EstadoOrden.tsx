import { ETIQUETA_ESTADO, type EstadoOrden as Estado } from '@/lib/estados';

// Colour pairs from the brand's allowed text pairs. The label is always printed, so colour is
// never the only signal.
const PARES = {
  espera: { fondo: 'var(--mazorca)', texto: 'var(--tostado)' },
  preparada: { fondo: 'var(--grano-fresco)', texto: 'var(--pulpa)' },
  hecha: { fondo: 'var(--tostado)', texto: 'var(--pulpa)' },
  problema: { fondo: 'var(--criollo)', texto: 'var(--pulpa)' },
} as const;

const COLOR_POR_ESTADO: Record<Estado, (typeof PARES)[keyof typeof PARES]> = {
  creada: PARES.espera,
  esperando_pago: PARES.espera,
  pagada: PARES.espera,
  lista: PARES.preparada,
  entregada: PARES.hecha,
  cerrada: PARES.hecha,
  resuelta: PARES.hecha,
  expirada: PARES.problema,
  disputada: PARES.problema,
  // Jobs: agreed and waiting for the work, done and waiting for payment, cancelled.
  acordada: PARES.espera,
  hecha: PARES.preparada,
  cancelada: PARES.problema,
};

/** The order state as a chip: the Spanish label on a brand colour. */
export function EstadoOrden({ estado }: { estado: Estado }) {
  const par = COLOR_POR_ESTADO[estado];
  return (
    <span className="marca" style={{ background: par.fondo, color: par.texto }}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

import { contarNoLeidos } from '@/servidor/avisos';
import { sesionActual } from '@/servidor/sesion';

// Unread notice count, drawn as a small badge above the "Órdenes" label. It reads the session,
// so the caller wraps it in Suspense. Nothing is rendered at zero or when signed out.
export async function InsigniaAvisos() {
  const sesion = await sesionActual();
  if (!sesion) return null;
  const total = await contarNoLeidos(sesion.usuario.id);
  if (total === 0) return null;

  const etiqueta = `${total} ${total === 1 ? 'aviso' : 'avisos'} sin leer`;
  return (
    <span role="img" aria-label={etiqueta} className="insignia">
      {total > 99 ? '99+' : total}
    </span>
  );
}

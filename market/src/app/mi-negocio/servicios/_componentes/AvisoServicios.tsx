import estilos from '../estilos.module.css';

export type EstadoNegocioServicios = 'pendiente' | 'aprobado' | 'suspendido';

// Why the shop cannot publish or change services now, or null when it can. The database refuses
// the write in the same cases, so the screens check first and say why.
export function motivoSinPublicar(estado: EstadoNegocioServicios): string | null {
  if (estado === 'aprobado') return null;
  if (estado === 'suspendido') {
    return 'Tu negocio está suspendido. No podés publicar ni cambiar servicios mientras dure la suspensión.';
  }
  return 'Tu negocio todavía no está aprobado. Cuando lo aprueben vas a poder publicar servicios.';
}

export function AvisoServicios({ motivo, id }: { motivo: string | null; id: string }) {
  if (motivo === null) return null;
  return (
    <p id={id} className={`${estilos.noticia} aviso`}>
      {motivo}
    </p>
  );
}

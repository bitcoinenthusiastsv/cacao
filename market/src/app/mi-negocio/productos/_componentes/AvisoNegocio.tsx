import estilos from '../estilos.module.css';

// Shown while the shop is not approved: the seller can prepare products, buyers cannot see them.
export function AvisoNegocio({ estado }: { estado: 'pendiente' | 'aprobado' | 'suspendido' }) {
  if (estado === 'aprobado') return null;

  const texto =
    estado === 'suspendido'
      ? 'Tu negocio está suspendido, así que los compradores no ven tus productos. Podés seguir preparándolos.'
      : 'Tu negocio todavía no está aprobado. Podés preparar tus productos, pero los compradores no los ven hasta que lo aprobemos.';

  return <p className={`${estilos.noticia} aviso`}>{texto}</p>;
}

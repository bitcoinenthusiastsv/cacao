import Link from 'next/link';

import estilos from './Paginacion.module.css';

// Previous and next page for a list. The links keep the other filters through hrefDe.
export function Paginacion({
  pagina,
  totalPaginas,
  hrefDe,
}: {
  pagina: number;
  totalPaginas: number;
  hrefDe: (pagina: number) => string;
}) {
  if (totalPaginas <= 1) return null;

  return (
    <nav aria-label="Páginas" className={estilos.paginacion}>
      {pagina > 1 ? (
        <Link href={hrefDe(pagina - 1)} className="boton boton--secundario">
          Anterior
        </Link>
      ) : (
        <span className={`boton boton--secundario ${estilos.inactivo}`} aria-disabled="true">
          Anterior
        </span>
      )}
      <span className={estilos.posicion}>
        Página {pagina} de {totalPaginas}
      </span>
      {pagina < totalPaginas ? (
        <Link href={hrefDe(pagina + 1)} className="boton boton--secundario">
          Siguiente
        </Link>
      ) : (
        <span className={`boton boton--secundario ${estilos.inactivo}`} aria-disabled="true">
          Siguiente
        </span>
      )}
    </nav>
  );
}

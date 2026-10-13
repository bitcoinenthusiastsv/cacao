import Link from 'next/link';

import styles from './ordenes.module.css';

// Links to the other pages of an order list. Page 1 is the plain address, so it stays shareable.
export function Paginacion({ ruta, pagina, paginas }: { ruta: string; pagina: number; paginas: number }) {
  if (paginas <= 1) return null;
  const hacia = (n: number) => (n === 1 ? ruta : `${ruta}?pagina=${n}`);
  return (
    <nav aria-label="Páginas de órdenes" className={styles.paginacion}>
      {pagina > 1 && <Link href={hacia(pagina - 1)}>Órdenes más recientes</Link>}
      <span className="dato">
        Página {pagina} de {paginas}
      </span>
      {pagina < paginas && <Link href={hacia(pagina + 1)}>Ver órdenes más antiguas</Link>}
    </nav>
  );
}

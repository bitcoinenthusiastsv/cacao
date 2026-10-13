import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Página no encontrada',
};

export default function NoEncontrada() {
  return (
    <section className="pagina-vacia">
      <h1>Esta página no existe.</h1>
      <p>
        <Link href="/">Volver al inicio</Link>
      </p>
    </section>
  );
}

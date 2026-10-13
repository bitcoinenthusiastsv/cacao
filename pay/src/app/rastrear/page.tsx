import type { Metadata } from 'next';

import { FormularioRastreo } from './FormularioRastreo';
import estilos from './estilos.module.css';

export const metadata: Metadata = {
  title: 'Seguir un envío',
};

// No account needed: anyone with the code can follow the transfer.
export default function PaginaRastrear() {
  return (
    <div className={estilos.pagina}>
      <section className="encabezado">
        <h1>Seguí tu envío</h1>
        <p>Escribí el código y mirá en qué estado está el dinero.</p>
      </section>
      <FormularioRastreo />
    </div>
  );
}

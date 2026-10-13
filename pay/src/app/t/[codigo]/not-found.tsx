import { Boton } from '@/componentes/Boton';

// Shown for a code that is malformed or unknown. Calm, and one way back.
export default function CodigoNoEncontrado() {
  return (
    <section className="pagina-vacia">
      <h1>No encontramos un envío con ese código</h1>
      <p>Revisá el código que te pasaron. Se ve así: CP-7F3K-92QD.</p>
      <Boton href="/rastrear">Probar otro código</Boton>
    </section>
  );
}

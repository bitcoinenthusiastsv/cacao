import { Boton } from '@/componentes/Boton';

// Also what a person sees for someone else's transfer: the same answer as a missing one.
export default function EnvioNoEncontrado() {
  return (
    <section className="pagina-vacia">
      <h1>No encontramos ese envío</h1>
      <p>Puede que el enlace esté mal o que el envío no sea tuyo.</p>
      <Boton href="/recibidos" variante="secundario">
        Ver el dinero que te mandaron
      </Boton>
    </section>
  );
}

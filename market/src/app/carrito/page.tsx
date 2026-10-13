import type { Metadata } from 'next';

import { CarritoCliente } from './CarritoCliente';

// Public page: the cart lives in the browser, so no session is needed to look at it.
export const metadata: Metadata = { title: 'Carrito' };

export default function PaginaCarrito() {
  return (
    <>
      <section className="encabezado">
        <h1>Tu carrito</h1>
        <p>Revisamos precios y stock antes de hacer cada pedido.</p>
      </section>
      <CarritoCliente />
    </>
  );
}

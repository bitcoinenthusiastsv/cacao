import { afterAll, describe, expect, it } from 'vitest';

import {
  limpiar,
  ordenDe,
  negocio,
  pagar,
  pedir,
  producto,
  stockDe,
  sufijo,
  usuarioNuevo,
} from './ayuda';
import { cancelarOrden } from '@/servidor/pedidos';

// The buyer's cancellation through the server layer: who may cancel, what happens to the stock, and
// the Spanish reason the page shows when it is refused.

afterAll(limpiar);

async function pedidoCreado(cantidad = 2, stock = 5) {
  const vendedor = await usuarioNuevo();
  const comprador = await usuarioNuevo();
  const tienda = await negocio(vendedor);
  const prod = await producto(vendedor, { stock, nombre: `Cacao ${sufijo()}` });
  const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad }]);
  return { vendedor, comprador, prod, orden };
}

describe('cancelarOrden (server layer), product order', () => {
  it('the buyer cancels an unpaid order: the stock comes back and the order reads cancelada', async () => {
    const { comprador, prod, orden } = await pedidoCreado(2, 5);
    expect(await stockDe(prod.id)).toBe(3);

    const r = await cancelarOrden(orden.id, comprador.id, 'Cambié de idea, gracias.');
    expect(r.ok).toBe(true);
    expect(await stockDe(prod.id)).toBe(5);

    const fila = await ordenDe(orden.id);
    expect(fila.estado).toBe('cancelada');
    expect(fila.motivo_cancelacion).toBe('Cambié de idea, gracias.');
    expect(fila.cancelada_en).not.toBeNull();
  });

  it('a second cancel is refused: the order is no longer cancellable', async () => {
    const { comprador, prod, orden } = await pedidoCreado(1, 4);
    expect((await cancelarOrden(orden.id, comprador.id, 'Primer intento.')).ok).toBe(true);
    const otra = await cancelarOrden(orden.id, comprador.id, 'Segundo intento.');
    expect(otra.ok).toBe(false);
    if (otra.ok) return;
    expect(otra.codigo).toBe('ESTADO_INVALIDO');
    expect(await stockDe(prod.id)).toBe(4);
  });

  it('a stranger does not learn the order exists: NO_ENCONTRADA, and the stock is untouched', async () => {
    const { prod, orden } = await pedidoCreado(2, 5);
    const extrano = await usuarioNuevo();
    const r = await cancelarOrden(orden.id, extrano.id, 'No es mi pedido.');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('NO_ENCONTRADA');
    expect(await stockDe(prod.id)).toBe(3);
    expect((await ordenDe(orden.id)).estado).toBe('creada');
  });

  it('the seller is refused: NO_PERMITIDO, and only the buyer can cancel a product order', async () => {
    const { vendedor, prod, orden } = await pedidoCreado(2, 5);
    const r = await cancelarOrden(orden.id, vendedor.id, 'Cancelo yo.');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('NO_PERMITIDO');
    expect(await stockDe(prod.id)).toBe(3);
  });

  it('a paid order cannot be cancelled: ESTADO_INVALIDO, the order stays paid', async () => {
    const { comprador, prod, orden } = await pedidoCreado(2, 5);
    await pagar(orden.id);
    const r = await cancelarOrden(orden.id, comprador.id, 'Ya pagué, quiero cancelar.');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('ESTADO_INVALIDO');
    expect((await ordenDe(orden.id)).estado).toBe('pagada');
    expect(await stockDe(prod.id)).toBe(3);
  });

  it('a reason shorter than four characters is refused before the database changes anything', async () => {
    const { comprador, prod, orden } = await pedidoCreado(2, 5);
    const r = await cancelarOrden(orden.id, comprador.id, ' no ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('DATOS_INVALIDOS');
    expect(r.mensaje).toBe('El motivo tiene que tener entre 4 y 300 caracteres.');
    expect((await ordenDe(orden.id)).estado).toBe('creada');
    expect(await stockDe(prod.id)).toBe(3);
  });

  it('an id that is not a UUID is not an order', async () => {
    const { comprador } = await pedidoCreado(1, 2);
    const r = await cancelarOrden('no-es-un-id', comprador.id, 'Motivo de prueba.');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('NO_ENCONTRADA');
  });
});

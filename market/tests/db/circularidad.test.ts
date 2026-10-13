import { afterAll, describe, expect, it } from 'vitest';
import { negocio, pagar, pedir, producto, servicio, usuarioNuevo, limpiar } from './ayuda';

// Circularity metric on fresh shops: A sells to a stranger and also buys from B.

afterAll(limpiar);

describe('métrica de circularidad', () => {
  it('muestra los sats cobrados, re-gastados e índice del vendedor que también compra', async () => {
    const s = servicio();
    const ownerA = await usuarioNuevo();
    const ownerB = await usuarioNuevo();
    const extrano = await usuarioNuevo();
    const tiendaA = await negocio(ownerA);
    const tiendaB = await negocio(ownerB);
    const prodA = await producto(ownerA, { precio: 350, stock: 5 });
    const prodB = await producto(ownerB, { precio: 175, stock: 5 });

    // A sells 3500 sats to a stranger.
    const ventaA = await pedir(extrano, tiendaA, [{ producto: prodA.id, cantidad: 1 }]);
    await pagar(ventaA.id);

    // A buys 1750 sats from B.
    const compraA = await pedir(ownerA, tiendaB, [{ producto: prodB.id, cantidad: 1 }]);
    await pagar(compraA.id);

    // An unpaid order must not count.
    await pedir(ownerA, tiendaB, [{ producto: prodB.id, cantidad: 1 }]);

    const { data: filaA, error: errorA } = await s
      .from('circularidad_negocios')
      .select('negocio_id, nombre, sats_cobrados, sats_regastados, indice')
      .eq('negocio_id', tiendaA)
      .single();
    expect(errorA).toBeNull();
    expect(filaA!.sats_cobrados).toBe(3500);
    expect(filaA!.sats_regastados).toBe(1750);
    expect(Number(filaA!.indice)).toBe(0.5);

    const { data: filaB, error: errorB } = await s
      .from('circularidad_negocios')
      .select('negocio_id, sats_cobrados, sats_regastados, indice')
      .eq('negocio_id', tiendaB)
      .single();
    expect(errorB).toBeNull();
    expect(filaB!.sats_cobrados).toBe(1750);
    expect(filaB!.sats_regastados).toBe(0);
    expect(Number(filaB!.indice)).toBe(0);
  });

  it('el índice es nulo cuando un negocio todavía no cobró nada', async () => {
    const s = servicio();
    const owner = await usuarioNuevo();
    const tienda = await negocio(owner);

    const { data, error } = await s
      .from('circularidad_negocios')
      .select('sats_cobrados, sats_regastados, indice')
      .eq('negocio_id', tienda)
      .single();
    expect(error).toBeNull();
    expect(data!.sats_cobrados).toBe(0);
    expect(data!.indice).toBeNull();
  });

  it('circularidad_red devuelve totales coherentes con las tiendas', async () => {
    const s = servicio();
    const { data, error } = await s.rpc('circularidad_red');
    expect(error).toBeNull();
    const red = Array.isArray(data) ? data[0] : data;

    expect(red.sats_regastados).toBeLessThanOrEqual(red.sats_cobrados);
    expect(red.negocios).toBeGreaterThanOrEqual(red.negocios_que_compran);
    expect(red.porcentaje).toBeGreaterThanOrEqual(0);
    expect(red.porcentaje).toBeLessThanOrEqual(100);
    if (red.sats_cobrados === 0) {
      expect(red.indice).toBeNull();
    } else {
      expect(Number(red.indice)).toBeCloseTo(red.sats_regastados / red.sats_cobrados, 3);
    }
  });
});

import { afterAll, describe, expect, it } from 'vitest';

import { embudoAdmin } from '@/servidor/admin';
import { confirmarPagoEnBD } from '@/servidor/pagos';
import { type EventoARegistrar, type NombreEvento, registrarEvento } from '@/servidor/eventos';

import {
  administrador,
  codigoDe,
  contratar,
  limpiar,
  marcarHechaRaw,
  negocio,
  pedir,
  producto,
  servicio,
  servicioDe,
  sufijo,
  usuarioNuevo,
  type Usuario,
} from './ayuda';

// The funnel on the server: registrarEvento never throws, the payment event is recorded once, and the
// funnel page's loader answers only to an administrator.

afterAll(limpiar);

// A window around the test run, so the funnel counts only what this file wrote.
function ventana(): { desde: string; hasta: string } {
  return {
    desde: new Date(Date.now() - 60_000).toISOString(),
    hasta: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

function evento(parche: Partial<EventoARegistrar> = {}): EventoARegistrar {
  return {
    nombre: 'vista_producto',
    sesion: `s-${sufijo()}${sufijo()}`,
    usuarioId: null,
    ruta: '/productos/ejemplo',
    objeto: null,
    valorUsdCentavos: null,
    ...parche,
  };
}

async function eventosDeObjeto(objeto: string, nombre: string) {
  const { data, error } = await servicio()
    .from('eventos')
    .select('sesion, valor_usd_centavos, usuario_id, ruta')
    .eq('sitio', 'market')
    .eq('nombre', nombre)
    .eq('objeto', objeto);
  if (error) throw error;
  return data ?? [];
}

describe('registrarEvento (server layer)', () => {
  it('never throws for a name the database does not allow', async () => {
    const sinNombre = registrarEvento(evento({ nombre: 'evento_inventado' as NombreEvento }));
    await expect(sinNombre).resolves.toBeUndefined();
  });

  it('never throws for a session id that is too short or a path that is too long', async () => {
    await expect(registrarEvento(evento({ sesion: 'corta' }))).resolves.toBeUndefined();
    await expect(registrarEvento(evento({ ruta: '/x'.repeat(150) }))).resolves.toBeUndefined();
  });

  it('records the event once per session, object and hour: a repeat inside the hour adds nothing', async () => {
    const producto_ = `${crypto.randomUUID()}`;
    const e = evento({ nombre: 'vista_producto', objeto: producto_ });
    await registrarEvento(e);
    await registrarEvento(e);
    const filas = await eventosDeObjeto(producto_, 'vista_producto');
    expect(filas).toHaveLength(1);
    expect(filas[0].sesion).toBe(e.sesion);
    expect(filas[0].ruta).toBe('/productos/ejemplo');
  });

  it('a failed insert is logged and the caller carries on', async () => {
    const original = console.warn;
    const avisos: unknown[] = [];
    console.warn = (...args: unknown[]) => avisos.push(args);
    try {
      await expect(registrarEvento(evento({ nombre: 'otro' as NombreEvento }))).resolves.toBeUndefined();
    } finally {
      console.warn = original;
    }
    expect(avisos.length).toBeGreaterThan(0);
    expect(String(avisos[0])).toContain('registrar_evento');
  });
});

describe('the payment event', () => {
  it('a product payment confirmed through the one payment function is counted once, with the order total', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 6, precio: 350 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 2 }]);

    const s = servicio();
    const { error: errorCobro } = await s.rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: `falso-${sufijo()}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 600_000).toISOString(),
    });
    expect(errorCobro).toBeNull();

    // The seller's manual confirmation has no buyer browser: the event counts under the order.
    expect(await confirmarPagoEnBD(orden.id, vendedor.id, null)).toBeNull();
    const filas = await eventosDeObjeto(orden.id, 'pago');
    expect(filas).toHaveLength(1);
    expect(filas[0].sesion).toBe(`orden-${orden.id}`);
    expect(filas[0].valor_usd_centavos).toBe(orden.total_usd_centavos);
    expect(filas[0].usuario_id).toBe(comprador.id);

    // Paying again is refused by the database, and no second event is written.
    const otra = await confirmarPagoEnBD(orden.id, vendedor.id, null);
    expect(codigoDe(otra)).toBe('ESTADO_INVALIDO');
    expect(await eventosDeObjeto(orden.id, 'pago')).toHaveLength(1);
  });

  it('a payment with the buyer browser counts under that browser session', async () => {
    const vendedor = await usuarioNuevo();
    const comprador = await usuarioNuevo();
    const tienda = await negocio(vendedor);
    const prod = await producto(vendedor, { stock: 3 });
    const orden = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 1 }]);
    await servicio().rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: `falso-${sufijo()}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 600_000).toISOString(),
    });
    const sesion = `navegador-${sufijo()}${sufijo()}`;
    expect(await confirmarPagoEnBD(orden.id, null, sesion)).toBeNull();
    const filas = await eventosDeObjeto(orden.id, 'pago');
    expect(filas.map((f) => f.sesion)).toEqual([sesion]);
  });

  it('a job payment is not a product payment: the funnel does not count it', async () => {
    const dueno = await usuarioNuevo();
    const cliente = await usuarioNuevo();
    const tienda = await negocio(dueno);
    const svc = await servicioDe(dueno, { tipo: 'fijo', precio: 500 });
    const trabajo = await contratar(cliente, svc.id);
    expect(trabajo.negocio_id).toBe(tienda);
    const marcada = await marcarHechaRaw(trabajo.id, dueno);
    expect(marcada.error).toBeNull();
    await servicio().rpc('registrar_cobro_servicio', {
      p_orden: trabajo.id,
      p_proveedor: 'falso',
      p_referencia: `falso-${sufijo()}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 600_000).toISOString(),
      p_cotizacion_btc: 100000,
    });
    expect(await confirmarPagoEnBD(trabajo.id, null, null)).toBeNull();
    expect(await eventosDeObjeto(trabajo.id, 'pago')).toHaveLength(0);
  });
});

describe('embudoAdmin (server layer)', () => {
  it('answers only to an administrator: anyone else gets not found', async () => {
    const visitante: Usuario = await usuarioNuevo();
    const { desde, hasta } = ventana();
    await expect(embudoAdmin(visitante.id, desde, hasta)).rejects.toThrow();
  });

  it('for an administrator: the five product steps, in funnel order, with the counts of the window', async () => {
    const admin = await administrador();
    const { desde, hasta } = ventana();
    const pasos = await embudoAdmin(admin.id, desde, hasta);
    expect(pasos.map((p) => p.nombre)).toEqual(['vista_producto', 'agrego_carrito', 'inicio_pedido', 'vio_pago', 'pago']);
    expect(pasos.map((p) => p.orden)).toEqual([1, 2, 3, 4, 5]);
    for (const p of pasos) {
      expect(p.sesiones).toBeGreaterThanOrEqual(0);
      expect(typeof p.valorUsdCentavos).toBe('number');
    }
  });
});

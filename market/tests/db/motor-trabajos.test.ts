import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { misAvisos } from '@/servidor/avisos';
import { abrirDisputa } from '@/servidor/disputas';
import { resolverDisputa, trabajosSinPagar } from '@/servidor/admin';
import { asegurarCobro, estadoDePago, reiniciarCobro, simularPago } from '@/servidor/pagos';
import {
  cancelarOrden,
  crearResena,
  detalleDeOrden,
  entregarConCodigo,
  marcarHecha,
  marcarLista,
  misCompras,
} from '@/servidor/pedidos';
import type { Sesion } from '@/servidor/sesion';

import {
  administrador,
  avisosDe,
  COTIZACION,
  contratar,
  limpiar,
  limpiarTablon,
  negocio,
  ordenDe,
  pedir,
  producto,
  servicio,
  servicioDe,
  sesionDe,
  usuarioNuevo,
  type Usuario,
} from './ayuda';

// The payment and order functions of the server layer, run against the local database.
// Sessions read through clienteSesion(), which needs a request for its cookies. The tests hand it the
// signed-in user's client instead. Everything else is the real code.

let clienteDePrueba: SupabaseClient | null = null;

vi.mock('@/servidor/supabase', async (original) => {
  const real = await original<typeof import('@/servidor/supabase')>();
  return {
    ...real,
    clienteSesion: async () => {
      if (!clienteDePrueba) throw new Error('La prueba no preparó una sesión.');
      return clienteDePrueba;
    },
  };
});

const PRECIO_ANTERIOR = process.env.PRECIO_FIJO_USD_BTC;

beforeAll(() => {
  // A fixed quote, so the sats are known: 500 cents at COTIZACION is 5,000 sats.
  process.env.PRECIO_FIJO_USD_BTC = String(COTIZACION);
});

afterAll(async () => {
  if (PRECIO_ANTERIOR === undefined) delete process.env.PRECIO_FIJO_USD_BTC;
  else process.env.PRECIO_FIJO_USD_BTC = PRECIO_ANTERIOR;
  await limpiarTablon();
  await limpiar();
});

const PASADO = () => new Date(Date.now() - 60_000).toISOString();
const HORA = 60 * 60 * 1000;

// A shop that uses the fake provider, so a payment request needs no network.
async function tiendaFalsa(dueno: Usuario): Promise<string> {
  const id = await negocio(dueno);
  const { error } = await servicio().from('negocios').update({ tipo_proveedor_pago: 'falso' }).eq('id', id);
  if (error) throw error;
  return id;
}

// A job hired from a fixed-price service: acordada, 500 cents, 5,000 sats at the test quote.
async function trabajoAcordado(precio = 500) {
  const dueno = await usuarioNuevo();
  const tienda = await tiendaFalsa(dueno);
  const svc = await servicioDe(dueno, { precio, unidad: 'por corte' });
  const cliente = await usuarioNuevo();
  const orden = await contratar(cliente, svc.id);
  return { dueno, tienda, cliente, orden };
}

// A job the shop has marked done.
async function trabajoHecho() {
  const trabajo = await trabajoAcordado();
  const r = await marcarHecha(trabajo.orden.id, trabajo.dueno.id);
  if (!r.ok) throw new Error(r.mensaje);
  return trabajo;
}

async function cobroDe(ordenId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await servicio().from('cobros').select('*').eq('orden_id', ordenId).maybeSingle();
  if (error) throw error;
  return data;
}

// The order detail as one viewer gets it: the buyer, or the owner of the shop given as tiendaId.
async function detalleComo(usuario: Usuario, ordenId: string, tiendaId: string | null = null) {
  clienteDePrueba = await sesionDe(usuario);
  const sesion = {
    usuario: { id: usuario.id, nombre: '', esAdmin: false, telefono: usuario.telefono, correo: '' },
    negocio: tiendaId ? { id: tiendaId, nombre: '', estado: 'aprobado', abierto: true } : null,
  } as unknown as Sesion;
  return detalleDeOrden(ordenId, sesion);
}

describe('cobro de un trabajo', () => {
  it('no se puede pedir el pago de un trabajo acordado', async () => {
    const { orden } = await trabajoAcordado();

    const r = await asegurarCobro(orden.id);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('ESTADO_INVALIDO');
    expect((await ordenDe(orden.id)).estado).toBe('acordada');
    expect(await cobroDe(orden.id)).toBeNull();
  });

  it('en hecha crea la solicitud: la orden queda esperando pago, con los sats de la cotización fija', async () => {
    const { orden } = await trabajoHecho();

    expect((await asegurarCobro(orden.id)).ok).toBe(true);

    const o = await ordenDe(orden.id);
    expect(o.estado).toBe('esperando_pago');
    expect(o.total_usd_centavos).toBe(500);
    expect(o.total_sats).toBe(5000);
    expect(Number(o.cotizacion_usd_btc)).toBe(COTIZACION);

    const cobro = await cobroDe(orden.id);
    expect(cobro?.estado).toBe('pendiente');
    expect(cobro?.proveedor).toBe('falso');
    expect(Date.parse(String(cobro?.expira_en))).toBeGreaterThan(Date.now() + 500_000);
  });

  it('con la solicitud viva, pedirla otra vez devuelve la misma', async () => {
    const { orden } = await trabajoHecho();
    await asegurarCobro(orden.id);
    const primera = await cobroDe(orden.id);

    expect((await asegurarCobro(orden.id)).ok).toBe(true);
    expect((await cobroDe(orden.id))?.id).toBe(primera?.id);
  });

  it('simularPago deja el trabajo entregado, con pagada_en y sin código de entrega', async () => {
    const { orden, cliente } = await trabajoHecho();
    await asegurarCobro(orden.id);

    expect((await simularPago(orden.id, cliente.id)).ok).toBe(true);

    const o = await ordenDe(orden.id);
    expect(o.estado).toBe('entregada');
    expect(o.pagada_en).not.toBeNull();
    expect(o.entregada_en).not.toBeNull();
    expect(o.codigo_entrega).toBeNull();
    expect(o.modo_entrega).toBeNull();
  });

  it('una solicitud vencida vuelve el trabajo a hecha; pagar la vieja no lo marca pagado; pedir otra sí', async () => {
    const { orden, cliente } = await trabajoHecho();
    await asegurarCobro(orden.id);
    const { error } = await servicio().from('cobros').update({ expira_en: PASADO() }).eq('orden_id', orden.id);
    if (error) throw error;

    // Paying the lapsed invoice is refused: the order is not marked paid.
    const tarde = await simularPago(orden.id, cliente.id);
    expect(tarde.ok).toBe(false);
    if (!tarde.ok) expect(tarde.codigo).toBe('FUERA_DE_PLAZO');
    expect((await ordenDe(orden.id)).estado).toBe('esperando_pago');

    // The payment screen reads the order: barrer has moved it back to hecha.
    const pantalla = await estadoDePago(orden.id, cliente.id);
    expect(pantalla.ok).toBe(true);
    if (pantalla.ok) {
      expect(pantalla.dato.estado).toBe('hecha');
      expect(pantalla.dato.tipo).toBe('servicio');
      expect(pantalla.dato.bolt11).toBeNull();
    }
    expect((await ordenDe(orden.id)).estado).toBe('hecha');
    expect((await cobroDe(orden.id))?.estado).toBe('expirado');

    // A new live request, then paying it works.
    expect((await asegurarCobro(orden.id)).ok).toBe(true);
    expect((await ordenDe(orden.id)).estado).toBe('esperando_pago');
    expect((await simularPago(orden.id, cliente.id)).ok).toBe(true);
    expect((await ordenDe(orden.id)).estado).toBe('entregada');
  });

  it('reiniciarCobro hace la solicitud nueva para el cliente, y a nadie más', async () => {
    const { orden, cliente } = await trabajoHecho();
    await asegurarCobro(orden.id);
    await servicio().from('cobros').update({ expira_en: PASADO() }).eq('orden_id', orden.id);
    await estadoDePago(orden.id, cliente.id); // lapses the request: the job is hecha again

    const extrano = await usuarioNuevo();
    const ajeno = await reiniciarCobro(orden.id, extrano.id);
    expect(ajeno.ok).toBe(false);
    if (!ajeno.ok) expect(ajeno.codigo).toBe('NO_ENCONTRADA');

    const nueva = await reiniciarCobro(orden.id, cliente.id);
    expect(nueva.ok).toBe(true);
    if (nueva.ok) {
      expect(nueva.dato.estado).toBe('esperando_pago');
      expect(nueva.dato.bolt11).toBeTruthy();
    }
  });
});

describe('quien no es parte de la orden', () => {
  it('estadoDePago, marcarHecha y cancelarOrden responden NO_ENCONTRADA', async () => {
    const { orden } = await trabajoHecho();
    const extrano = await usuarioNuevo();

    const pantalla = await estadoDePago(orden.id, extrano.id);
    expect(!pantalla.ok && pantalla.codigo).toBe('NO_ENCONTRADA');

    const acordado = await trabajoAcordado();
    const marcar = await marcarHecha(acordado.orden.id, extrano.id);
    expect(!marcar.ok && marcar.codigo).toBe('NO_ENCONTRADA');

    const cancelar = await cancelarOrden(acordado.orden.id, extrano.id, 'Motivo de prueba');
    expect(!cancelar.ok && cancelar.codigo).toBe('NO_ENCONTRADA');
    expect((await ordenDe(acordado.orden.id)).estado).toBe('acordada');
  });
});

describe('cancelar un trabajo acordado', () => {
  it('lo cancela el cliente, con motivo, y avisa a quien trabaja', async () => {
    const { orden, cliente, dueno } = await trabajoAcordado();

    const r = await cancelarOrden(orden.id, cliente.id, 'Ya no lo necesito.');
    expect(r.ok).toBe(true);

    const o = await ordenDe(orden.id);
    expect(o.estado).toBe('cancelada');
    expect(o.motivo_cancelacion).toBe('Ya no lo necesito.');
    expect(o.cancelada_en).not.toBeNull();
    const avisos = await avisosDe(orden.id);
    expect(avisos.some((a) => a.tipo === 'orden.cancelada' && a.usuario_id === dueno.id)).toBe(true);
  });

  it('lo cancela quien trabaja, en acordada', async () => {
    const { orden, dueno } = await trabajoAcordado();

    const r = await cancelarOrden(orden.id, dueno.id, 'No puedo ir ese día.');
    expect(r.ok).toBe(true);
    expect((await ordenDe(orden.id)).estado).toBe('cancelada');
  });

  it('no se cancela en hecha, y el motivo tiene entre 4 y 300 caracteres', async () => {
    const { orden, cliente } = await trabajoHecho();
    const r = await cancelarOrden(orden.id, cliente.id, 'Ya no lo quiero.');
    expect(!r.ok && r.codigo).toBe('ESTADO_INVALIDO');
    expect((await ordenDe(orden.id)).estado).toBe('hecha');

    const corto = await trabajoAcordado();
    const malo = await cancelarOrden(corto.orden.id, corto.cliente.id, 'no');
    expect(!malo.ok && malo.codigo).toBe('DATOS_INVALIDOS');
    expect((await ordenDe(corto.orden.id)).estado).toBe('acordada');
  });
});

describe('disputa de un trabajo sin pagar', () => {
  const MOTIVO = 'El trabajo no quedó terminado como lo acordamos.';

  it('el cliente abre la disputa en hecha; un resultado de reembolso se rechaza', async () => {
    const { orden, cliente } = await trabajoHecho();
    const abierta = await abrirDisputa(orden.id, cliente.id, MOTIVO, '');
    expect(abierta.ok).toBe(true);
    expect((await ordenDe(orden.id)).estado).toBe('disputada');

    const admin = await administrador();
    const dinero = await resolverDisputa(admin.id, orden.id, 'reembolso_total', 'Nota de prueba.');
    expect(!dinero.ok && dinero.codigo).toBe('DATOS_INVALIDOS');
    expect((await ordenDe(orden.id)).estado).toBe('disputada');
  });

  it('corresponde pagar devuelve el trabajo a hecha', async () => {
    const { orden, cliente } = await trabajoHecho();
    await abrirDisputa(orden.id, cliente.id, MOTIVO, '');

    const admin = await administrador();
    const r = await resolverDisputa(admin.id, orden.id, 'corresponde_pagar', 'Sí corresponde pagar el trabajo.');
    expect(r.ok).toBe(true);
    expect((await ordenDe(orden.id)).estado).toBe('hecha');
  });

  it('no corresponde pagar cancela el trabajo', async () => {
    const { orden, cliente } = await trabajoHecho();
    await abrirDisputa(orden.id, cliente.id, MOTIVO, '');

    const admin = await administrador();
    const r = await resolverDisputa(admin.id, orden.id, 'no_corresponde_pagar', 'No corresponde pagar este trabajo.');
    expect(r.ok).toBe(true);
    const o = await ordenDe(orden.id);
    expect(o.estado).toBe('cancelada');
    expect(o.motivo_cancelacion).toBe('No corresponde pagar este trabajo.');
  });
});

describe('trabajos sin pagar (administración)', () => {
  it('lista el trabajo hecho hace 49 horas y no el que se hizo ahora', async () => {
    const viejo = await trabajoHecho();
    const reciente = await trabajoHecho();
    const { error } = await servicio()
      .from('ordenes')
      .update({ hecha_en: new Date(Date.now() - 49 * HORA).toISOString() })
      .eq('id', viejo.orden.id);
    if (error) throw error;

    const admin = await administrador();
    const lista = await trabajosSinPagar(admin.id);

    const encontrado = lista.find((t) => t.id === viejo.orden.id);
    expect(encontrado).toBeDefined();
    expect(encontrado?.horasEsperando).toBeGreaterThanOrEqual(49);
    expect(encontrado?.totalSats).toBe(5000);
    expect(lista.some((t) => t.id === reciente.orden.id)).toBe(false);
  });

  it('a quien no es admin no le responde con la lista', async () => {
    const comun = await usuarioNuevo();
    await expect(trabajosSinPagar(comun.id)).rejects.toBeDefined();
  });
});

describe('avisos con ruta', () => {
  it('el aviso de una orden abre la orden; un aviso sin orden abre su ruta', async () => {
    const { orden, cliente } = await trabajoHecho();
    const { error } = await servicio().from('avisos').insert({
      usuario_id: cliente.id,
      tipo: 'cotizacion.solicitada',
      texto: 'Tenés una cotización nueva.',
      ruta: '/cotizaciones',
    });
    if (error) throw error;

    clienteDePrueba = await sesionDe(cliente);
    const avisos = await misAvisos(cliente.id, 20);

    expect(avisos.find((a) => a.ordenId === orden.id)?.ruta).toBe(`/ordenes/${orden.id}`);
    expect(avisos.find((a) => a.texto === 'Tenés una cotización nueva.')?.ruta).toBe('/cotizaciones');
  });
});

describe('detalle de un trabajo', () => {
  it('no trae codigoEntrega, ni para el cliente ni para quien trabaja', async () => {
    const { orden, cliente, dueno, tienda } = await trabajoHecho();
    await asegurarCobro(orden.id);
    await simularPago(orden.id, cliente.id);

    const comprador = await detalleComo(cliente, orden.id);
    expect(comprador?.rol).toBe('comprador');
    expect(comprador?.tipo).toBe('servicio');
    expect(comprador?.estado).toBe('entregada');
    expect(comprador?.modoEntrega).toBeNull();
    expect(comprador && 'codigoEntrega' in comprador).toBe(false);

    const vendedor = await detalleComo(dueno, orden.id, tienda);
    expect(vendedor?.rol).toBe('vendedor');
    expect(vendedor && 'codigoEntrega' in vendedor).toBe(false);
  });
});

describe('regresion: una orden de producto sigue su ciclo completo', () => {
  it('creada, esperando pago, pagada, lista, entregada con el código, reseñada y cerrada', async () => {
    const dueno = await usuarioNuevo();
    const tienda = await tiendaFalsa(dueno);
    const prod = await producto(dueno, { precio: 350, stock: 5 });
    const comprador = await usuarioNuevo();

    const creada = await pedir(comprador, tienda, [{ producto: prod.id, cantidad: 2 }]);
    expect(creada.estado).toBe('creada');
    expect(creada.tipo).toBe('productos');

    expect((await asegurarCobro(creada.id)).ok).toBe(true);
    const pantalla = await estadoDePago(creada.id, comprador.id);
    expect(pantalla.ok && pantalla.dato.estado).toBe('esperando_pago');
    expect(pantalla.ok && pantalla.dato.tipo).toBe('productos');

    expect((await simularPago(creada.id, comprador.id)).ok).toBe(true);
    expect((await ordenDe(creada.id)).estado).toBe('pagada');

    expect((await marcarLista(creada.id, dueno.id)).ok).toBe(true);
    expect((await ordenDe(creada.id)).estado).toBe('lista');

    // The buyer still sees the delivery code while the order is lista.
    const conCodigo = await detalleComo(comprador, creada.id);
    expect(conCodigo?.codigoEntrega).toMatch(/^\d{6}$/);
    expect(conCodigo?.modoEntrega).toBe('recogida');
    const codigo = conCodigo?.codigoEntrega ?? '';

    expect((await entregarConCodigo(creada.id, dueno.id, codigo)).ok).toBe(true);
    expect((await ordenDe(creada.id)).estado).toBe('entregada');

    expect((await crearResena(creada.id, comprador.id, 5, 'Todo bien.')).ok).toBe(true);

    // Forty-eight hours later the order closes by itself.
    const { error } = await servicio()
      .from('ordenes')
      .update({ entregada_en: new Date(Date.now() - 49 * HORA).toISOString() })
      .eq('id', creada.id);
    if (error) throw error;
    await servicio().rpc('cerrar_ordenes');
    expect((await ordenDe(creada.id)).estado).toBe('cerrada');

    clienteDePrueba = await sesionDe(comprador);
    const compras = await misCompras(comprador.id);
    expect(compras.find((c) => c.id === creada.id)?.estado).toBe('cerrada');
  });
});

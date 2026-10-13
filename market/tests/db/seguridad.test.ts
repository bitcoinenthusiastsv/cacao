import { afterAll, describe, expect, it } from 'vitest';
import { anonimo, categoriaDePrueba, negocio, pagar, pedir, producto, servicio, sesionConCodigo, usuarioNuevo, limpiar } from './ayuda';
import type { SupabaseClient } from '@supabase/supabase-js';

// Row-level security and column grants, checked with real user sessions. Buyers 06 and 07 are two of
// the test phones in supabase/config.toml; they sign in with the fixed code. Signing in is rate
// limited, so the two sessions are made once for the whole file.

const TELEFONO_1 = '50370000006';
const TELEFONO_2 = '50370000007';

let sesionesCache: Promise<{ b1: SupabaseClient; b2: SupabaseClient; u1: string }> | undefined;

function sesiones() {
  if (!sesionesCache) {
    sesionesCache = (async () => {
      const b1 = await sesionConCodigo(TELEFONO_1);
      const b2 = await sesionConCodigo(TELEFONO_2);
      const { data, error } = await b1.auth.getUser();
      if (error || !data.user) throw error ?? new Error('El comprador 1 no tiene sesión');
      return { b1, b2, u1: data.user.id };
    })();
  }
  return sesionesCache;
}

// A shop with one product, and an order by buyer 1 that is paid, has a message and a dispute.
async function preparar() {
  const { b1, b2, u1 } = await sesiones();
  const vendedor = await usuarioNuevo();
  const tienda = await negocio(vendedor);
  const prod = await producto(vendedor, { stock: 5 });

  const orden = await pedir({ id: u1, telefono: TELEFONO_1 }, tienda, [{ producto: prod.id, cantidad: 1 }]);
  await pagar(orden.id);

  const s = servicio();
  const { error: errorMensaje } = await s.rpc('enviar_mensaje', {
    p_orden: orden.id,
    p_actor: u1,
    p_texto: 'Mensaje privado del comprador 1',
  });
  if (errorMensaje) throw errorMensaje;
  const { error: errorDisputa } = await s.rpc('abrir_disputa', {
    p_orden: orden.id,
    p_actor: u1,
    p_motivo: 'Disputa privada del comprador 1',
    p_evidencia: '',
  });
  if (errorDisputa) throw errorDisputa;

  return { orden, u1, b1, b2, tienda, prod };
}

afterAll(limpiar);

describe('seguridad a nivel de fila', () => {
  it('el comprador 1 ve su orden y el comprador 2 no ve nada de ella', async () => {
    const { orden, b1, b2 } = await preparar();

    // Positive control: the owner sees the order.
    const propia = await b1.from('ordenes').select('id').eq('id', orden.id);
    expect(propia.error).toBeNull();
    expect(propia.data).toHaveLength(1);

    const ordenes = await b2.from('ordenes').select('id').eq('id', orden.id);
    expect(ordenes.error).toBeNull();
    expect(ordenes.data).toEqual([]);

    const lineas = await b2.from('lineas_orden').select('id').eq('orden_id', orden.id);
    expect(lineas.error).toBeNull();
    expect(lineas.data).toEqual([]);

    const mensajes = await b2.from('mensajes').select('id').eq('orden_id', orden.id);
    expect(mensajes.error).toBeNull();
    expect(mensajes.data).toEqual([]);

    const avisos = await b2.from('avisos').select('id').eq('orden_id', orden.id);
    expect(avisos.error).toBeNull();
    expect(avisos.data).toEqual([]);

    const disputas = await b2.from('disputas').select('id').eq('orden_id', orden.id);
    expect(disputas.error).toBeNull();
    expect(disputas.data).toEqual([]);

    const cobros = await b2.from('cobros').select('id, orden_id, estado').eq('orden_id', orden.id);
    expect(cobros.error).toBeNull();
    expect(cobros.data).toEqual([]);
  });

  it('el comprador 1 sí ve sus propios mensajes, disputas y cobros', async () => {
    const { orden, b1 } = await preparar();

    const mensajes = await b1.from('mensajes').select('texto').eq('orden_id', orden.id);
    expect(mensajes.data).toHaveLength(1);

    const disputas = await b1.from('disputas').select('estado').eq('orden_id', orden.id);
    expect(disputas.data).toHaveLength(1);

    const cobros = await b1.from('cobros').select('estado, expira_en').eq('orden_id', orden.id);
    expect(cobros.data).toHaveLength(1);
  });

  it('el comprador 2 no lee los avisos del comprador 1', async () => {
    const { b2, u1 } = await preparar();
    const ajenos = await b2.from('avisos').select('id, usuario_id').eq('usuario_id', u1);
    expect(ajenos.error).toBeNull();
    expect(ajenos.data).toEqual([]);
  });
});

describe('columnas que no salen al navegador', () => {
  it('nadie lee un teléfono por la sesión, ni el propio ni el ajeno', async () => {
    const { b1, b2, u1 } = await preparar();

    const propio = await b1.from('usuarios').select('telefono').eq('id', u1);
    expect(propio.error).not.toBeNull();

    const ajeno = await b2.from('usuarios').select('telefono').eq('id', u1);
    expect(ajeno.error).not.toBeNull();

    const nombrado = await b2.from('usuarios').select('id, nombre').eq('id', u1);
    expect(nombrado.error).toBeNull();
  });

  it('select * de negocios se rechaza, pero nombrar las columnas funciona', async () => {
    const { b1 } = await preparar();
    const todas = await b1.from('negocios').select('*');
    expect(todas.error).not.toBeNull();

    const nombradas = await b1.from('negocios').select('id, nombre, lightning_address');
    expect(nombradas.error).toBeNull();
    expect(nombradas.data?.length).toBeGreaterThanOrEqual(1);
  });

  it('select * de cobros se rechaza, y el enlace de verificación no sale del servidor', async () => {
    const { orden, b1 } = await preparar();
    const todas = await b1.from('cobros').select('*').eq('orden_id', orden.id);
    expect(todas.error).not.toBeNull();

    const verificacion = await b1.from('cobros').select('verificar_url').eq('orden_id', orden.id);
    expect(verificacion.error).not.toBeNull();
  });
});

describe('sesiones sin permiso y escrituras directas', () => {
  it('una sesión anónima no lee órdenes', async () => {
    const { orden } = await preparar();
    const r = await anonimo().from('ordenes').select('id').eq('id', orden.id);
    expect(r.error).not.toBeNull();
  });

  it('una sesión de usuario no puede ejecutar crear_orden', async () => {
    const { b1, u1, tienda, prod } = await preparar();
    const r = await b1.rpc('crear_orden', {
      p_comprador: u1,
      p_negocio: tienda,
      p_lineas: [{ producto_id: prod.id, cantidad: 1 }],
      p_modo: 'recogida',
      p_clave: 'intento-directo',
      p_cotizacion: 100000,
    });
    expect(r.error).not.toBeNull();
  });

  it('una sesión de usuario no puede insertar productos ni cambiar órdenes', async () => {
    const { orden, b1, tienda } = await preparar();

    const insertar = await b1.from('productos').insert({
      negocio_id: tienda,
      categoria_id: await categoriaDePrueba(),
      nombre: 'Producto colado',
      unidad: 'libra',
      precio_usd_centavos: 1,
      stock: 1,
    });
    expect(insertar.error).not.toBeNull();

    const cambiar = await b1.from('ordenes').update({ estado: 'lista' }).eq('id', orden.id);
    expect(cambiar.error).not.toBeNull();

    // preparar() already opened a dispute, so the order is disputada and nothing above changed it.
    const { data } = await servicio().from('ordenes').select('estado').eq('id', orden.id).single();
    expect(data?.estado).toBe('disputada');
  });
});

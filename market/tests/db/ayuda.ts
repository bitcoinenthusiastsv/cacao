import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Helpers for the database tests, which run against the local Supabase stack.
// Every test creates its own users, shops and products, so the tests pass on an empty database and
// on a seeded one. Only the nine test phones of supabase/config.toml can sign in with a code.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const sinSesion = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const CLAVE = 'clave-de-prueba-123';

export const COTIZACION = 100000;

// Rows come back from many different tables and functions; tests read their fields freely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Fila = Record<string, any>;

export type Usuario = { id: string; telefono: string; sesion?: SupabaseClient };

let servicioCache: SupabaseClient | undefined;

// Service-role client. Only the server may use it, and so may these tests.
export function servicio(): SupabaseClient {
  if (!servicioCache) {
    if (!url || !serviceKey) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Corré las pruebas con --env-file=.env.local.');
    }
    servicioCache = createClient(url, serviceKey, sinSesion);
  }
  return servicioCache;
}

export function anonimo(): SupabaseClient {
  return createClient(url, anonKey, sinSesion);
}

export function sufijo(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Signs in with the fixed test code. Works for the nine phones in supabase/config.toml; the user is
// created on first sign-in when the database is empty.
export async function sesionConCodigo(telefono: string): Promise<SupabaseClient> {
  const cliente = anonimo();
  const { error: errorEnvio } = await cliente.auth.signInWithOtp({ phone: telefono });
  if (errorEnvio) throw errorEnvio;
  const { error: errorCodigo } = await cliente.auth.verifyOtp({ phone: telefono, token: '123456', type: 'sms' });
  if (errorCodigo) throw errorCodigo;
  return cliente;
}

// A fresh user with a random phone outside the test range. Created with the admin API, so it does
// not use up the nine test phones.
export async function usuarioNuevo(): Promise<Usuario> {
  const telefono = `5035${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const { data, error } = await servicio().auth.admin.createUser({
    phone: telefono,
    password: CLAVE,
    phone_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, telefono };
}

// Signs a fresh user in with phone and password, once per user object.
export async function sesionDe(usuario: Usuario): Promise<SupabaseClient> {
  if (!usuario.sesion) {
    const cliente = anonimo();
    const { error } = await cliente.auth.signInWithPassword({ phone: usuario.telefono, password: CLAVE });
    if (error) throw error;
    usuario.sesion = cliente;
  }
  return usuario.sesion;
}

let adminCache: Usuario | undefined;

// One administrator per test file.
export async function administrador(): Promise<Usuario> {
  if (!adminCache) {
    const usuario = await usuarioNuevo();
    const { error } = await servicio().from('usuarios').update({ es_admin: true }).eq('id', usuario.id);
    if (error) throw error;
    adminCache = usuario;
  }
  return adminCache;
}

// Same six names and order as scripts/sembrar.mjs, so the catalogue has the same categories whether
// the tests or the seed run first.
const CATEGORIAS = ['Frutas', 'Verduras', 'Granos y café', 'Lácteos y huevos', 'Miel y conservas', 'Hierbas y plantas'];

// The first category, creating the six seed categories when the database has none.
export async function categoriaDePrueba(): Promise<number> {
  const s = servicio();
  const { error: errorAlta } = await s
    .from('categorias')
    .upsert(CATEGORIAS.map((nombre, i) => ({ nombre, orden: i + 1 })), { onConflict: 'nombre', ignoreDuplicates: true });
  if (errorAlta) throw errorAlta;
  const { data, error } = await s.from('categorias').select('id').order('orden').limit(1);
  if (error) throw error;
  return data![0].id;
}

// Shops created by this test file, suspended again by limpiar() so they leave the catalogue.
const negociosCreados: string[] = [];

// Creates a shop through solicitar_negocio. With aprobar, an administrator approves it.
export async function negocio(dueno: Usuario, opciones: { aprobar?: boolean; nombre?: string } = {}): Promise<string> {
  const s = servicio();
  const { data, error } = await s.rpc('solicitar_negocio', {
    p_usuario: dueno.id,
    p_nombre: opciones.nombre ?? `Negocio de prueba ${sufijo()}`,
    p_descripcion: 'Negocio creado por las pruebas de base de datos.',
    p_ubicacion: 'El Zonte, La Libertad',
    p_lightning_address: `prueba-${sufijo()}@ejemplo.sv`,
  });
  if (error) throw error;
  negociosCreados.push(data.id);
  if (opciones.aprobar !== false) {
    const admin = await administrador();
    const { error: errorAprobar } = await s.rpc('cambiar_estado_negocio', {
      p_negocio: data.id,
      p_actor: admin.id,
      p_estado: 'aprobado',
    });
    if (errorAprobar) throw errorAprobar;
  }
  return data.id as string;
}

// Suspends the shops this file created, so the test data does not show in the catalogue of a
// developer's database. Orders and history stay: they are part of the record.
export async function limpiar(): Promise<void> {
  if (negociosCreados.length === 0) return;
  const admin = await administrador();
  for (const id of negociosCreados.splice(0)) {
    const { error } = await servicio().rpc('cambiar_estado_negocio', {
      p_negocio: id,
      p_actor: admin.id,
      p_estado: 'suspendido',
    });
    if (error) throw error;
  }
}

// Creates a product in the owner's shop through guardar_producto.
export async function producto(
  dueno: Usuario,
  opciones: { precio?: number; stock?: number; activo?: boolean; nombre?: string } = {},
): Promise<Fila> {
  const { data, error } = await servicio().rpc('guardar_producto', {
    p_usuario: dueno.id,
    p_producto: null,
    p_categoria: await categoriaDePrueba(),
    p_nombre: opciones.nombre ?? `Producto ${sufijo()}`,
    p_descripcion: '',
    p_unidad: 'libra',
    p_precio: opciones.precio ?? 350,
    p_stock: opciones.stock ?? 10,
    p_activo: opciones.activo ?? true,
    p_fotos: [],
  });
  if (error) throw error;
  return data;
}

// Raw result of crear_orden, so tests can check the error.
export function pedirRaw(
  comprador: Usuario,
  negocioId: string,
  lineas: { producto: string; cantidad: number }[],
  opciones: { clave?: string; cotizacion?: number } = {},
) {
  return servicio().rpc('crear_orden', {
    p_comprador: comprador.id,
    p_negocio: negocioId,
    p_lineas: lineas.map((l) => ({ producto_id: l.producto, cantidad: l.cantidad })),
    p_modo: 'recogida',
    p_clave: opciones.clave ?? `clave-${sufijo()}`,
    p_cotizacion: opciones.cotizacion ?? COTIZACION,
  });
}

// Creates an order and fails the test if it is refused.
export async function pedir(
  comprador: Usuario,
  negocioId: string,
  lineas: { producto: string; cantidad: number }[],
  opciones: { clave?: string; cotizacion?: number } = {},
): Promise<Fila> {
  const { data, error } = await pedirRaw(comprador, negocioId, lineas, opciones);
  if (error) throw error;
  return data;
}

// Registers a request with the fake provider and marks it paid by the system.
export async function pagar(ordenId: string): Promise<Fila> {
  const s = servicio();
  const { error: errorCobro } = await s.rpc('registrar_cobro', {
    p_orden: ordenId,
    p_proveedor: 'falso',
    p_referencia: `falso-${sufijo()}`,
    p_bolt11: null,
    p_destino: null,
    p_verificar_url: null,
    p_expira_en: new Date(Date.now() + 600_000).toISOString(),
  });
  if (errorCobro) throw errorCobro;
  const { data, error } = await s.rpc('confirmar_pago', { p_orden: ordenId, p_actor: null });
  if (error) throw error;
  return data;
}

export async function fila(tabla: string, id: string): Promise<Fila> {
  const { data, error } = await servicio().from(tabla).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function ordenDe(ordenId: string): Promise<Fila> {
  return fila('ordenes', ordenId);
}

export async function stockDe(productoId: string): Promise<number> {
  return (await fila('productos', productoId)).stock as number;
}

export async function avisosDe(ordenId: string): Promise<Fila[]> {
  const { data, error } = await servicio().from('avisos').select('*').eq('orden_id', ordenId);
  if (error) throw error;
  return data ?? [];
}

export async function auditoriaDe(ordenId: string): Promise<Fila[]> {
  const { data, error } = await servicio()
    .from('auditoria')
    .select('*')
    .eq('entidad', 'orden')
    .eq('entidad_id', ordenId)
    .order('id');
  if (error) throw error;
  return data ?? [];
}

// The Spanish sentence starts with a code in capitals: "SIN_STOCK: Ya no quedan...".
export function codigoDe(error: { message?: string } | null | undefined): string | null {
  const coincide = /^([A-Z_]+):/.exec(error?.message ?? '');
  return coincide ? coincide[1] : null;
}

// ---------------------------------------------------------------------------------------------
// Services, the board and jobs (tests/db/servicios-*.test.ts).

const CATEGORIAS_SERVICIO = [
  'Hogar y reparaciones',
  'Transporte y mandados',
  'Belleza y cuidado personal',
  'Clases y tutorías',
  'Tecnología',
  'Comida y eventos',
];

// The first service category, creating the six seed categories when the database has none.
export async function categoriaServicioDePrueba(): Promise<number> {
  const s = servicio();
  const { error: errorAlta } = await s
    .from('categorias_servicio')
    .upsert(CATEGORIAS_SERVICIO.map((nombre, i) => ({ nombre, orden: i + 1 })), { onConflict: 'nombre', ignoreDuplicates: true });
  if (errorAlta) throw errorAlta;
  const { data, error } = await s.from('categorias_servicio').select('id').order('orden').limit(1);
  if (error) throw error;
  return data![0].id;
}

export type OpcionesServicio = {
  titulo?: string;
  tipo?: 'fijo' | 'cotizar';
  precio?: number;
  unidad?: string;
  activo?: boolean;
};

// Creates a service through guardar_servicio. Fixed price by default.
export async function servicioDe(dueno: Usuario, opciones: OpcionesServicio = {}): Promise<Fila> {
  const tipo = opciones.tipo ?? 'fijo';
  const { data, error } = await servicio().rpc('guardar_servicio', {
    p_usuario: dueno.id,
    p_servicio: null,
    p_categoria: await categoriaServicioDePrueba(),
    p_titulo: opciones.titulo ?? `Servicio de prueba ${sufijo()}`,
    p_descripcion: 'Servicio creado por las pruebas de base de datos.',
    p_zona: 'Suchitoto, Cuscatlán',
    p_tipo_precio: tipo,
    p_precio: tipo === 'fijo' ? (opciones.precio ?? 500) : null,
    p_unidad: tipo === 'fijo' ? (opciones.unidad ?? 'por corte') : null,
    p_activo: opciones.activo ?? true,
    p_fotos: [],
  });
  if (error) throw error;
  return data;
}

// Needs posted by the tests. limpiarTablon() cancels them so they leave the board.
const necesidadesCreadas: { id: string; autor: Usuario }[] = [];

export async function necesidadDe(
  autor: Usuario,
  opciones: { titulo?: string; presupuesto?: number | null } = {},
): Promise<Fila> {
  const { data, error } = await servicio().rpc('publicar_necesidad', {
    p_usuario: autor.id,
    p_categoria: await categoriaServicioDePrueba(),
    p_titulo: opciones.titulo ?? `Necesidad de prueba ${sufijo()}`,
    p_descripcion: 'Necesidad publicada por las pruebas de base de datos.',
    p_zona: 'Suchitoto, Cuscatlán',
    p_presupuesto: opciones.presupuesto === undefined ? 5000 : opciones.presupuesto,
  });
  if (error) throw error;
  necesidadesCreadas.push({ id: data.id, autor });
  return data;
}

// Cancels the needs this file posted. Needs already closed are skipped.
export async function limpiarTablon(): Promise<void> {
  for (const { id, autor } of necesidadesCreadas.splice(0)) {
    await servicio().rpc('cancelar_necesidad', { p_necesidad: id, p_usuario: autor.id });
  }
}

// Opens or closes a shop without going through the owner's form.
export async function abiertoNegocio(negocioId: string, abierto: boolean): Promise<void> {
  const { error } = await servicio().from('negocios').update({ abierto }).eq('id', negocioId);
  if (error) throw error;
}

// Suspends a shop: its services and offers stop showing. An administrator does it.
export async function suspenderNegocio(negocioId: string): Promise<void> {
  const admin = await administrador();
  const { error } = await servicio().rpc('cambiar_estado_negocio', {
    p_negocio: negocioId,
    p_actor: admin.id,
    p_estado: 'suspendido',
  });
  if (error) throw error;
}

// Hides a service or a need as an administrator.
export async function ocultarServicio(servicioId: string, oculto: boolean) {
  const admin = await administrador();
  const { data, error } = await servicio().rpc('ocultar_servicio', { p_servicio: servicioId, p_actor: admin.id, p_oculto: oculto });
  if (error) throw error;
  return data;
}

export async function ocultarNecesidad(necesidadId: string, oculta: boolean) {
  const admin = await administrador();
  const { data, error } = await servicio().rpc('ocultar_necesidad', { p_necesidad: necesidadId, p_actor: admin.id, p_oculta: oculta });
  if (error) throw error;
  return data;
}

export function cotizarRaw(cliente: Usuario, servicioId: string, descripcion = 'Quiero una cotización para un trabajo de prueba.') {
  return servicio().rpc('solicitar_cotizacion', {
    p_cliente: cliente.id,
    p_servicio: servicioId,
    p_descripcion: descripcion,
  });
}

export function responderRaw(cotizacionId: string, dueno: Usuario, precio: number, mensaje = 'Respuesta de prueba.') {
  return servicio().rpc('responder_cotizacion', {
    p_cotizacion: cotizacionId,
    p_actor: dueno.id,
    p_precio: precio,
    p_mensaje: mensaje,
  });
}

export function ofertarRaw(dueno: Usuario, necesidadId: string, precio: number, mensaje = 'Oferta de prueba.') {
  return servicio().rpc('ofertar', {
    p_usuario: dueno.id,
    p_necesidad: necesidadId,
    p_precio: precio,
    p_mensaje: mensaje,
  });
}

export function aceptarRaw(cotizacionId: string, cliente: Usuario, cotizacionBtc = COTIZACION) {
  return servicio().rpc('aceptar_cotizacion', {
    p_cotizacion: cotizacionId,
    p_actor: cliente.id,
    p_cotizacion_btc: cotizacionBtc,
  });
}

export function contratarRaw(
  cliente: Usuario,
  servicioId: string,
  opciones: { nota?: string; clave?: string; cotizacionBtc?: number } = {},
) {
  return servicio().rpc('contratar_servicio', {
    p_cliente: cliente.id,
    p_servicio: servicioId,
    p_nota: opciones.nota ?? '',
    p_clave: opciones.clave ?? `contrato-${sufijo()}`,
    p_cotizacion_btc: opciones.cotizacionBtc ?? COTIZACION,
  });
}

// Hires a fixed-price service and fails the test if it is refused.
export async function contratar(
  cliente: Usuario,
  servicioId: string,
  opciones: { nota?: string; clave?: string; cotizacionBtc?: number } = {},
): Promise<Fila> {
  const { data, error } = await contratarRaw(cliente, servicioId, opciones);
  if (error) throw error;
  return data;
}

// The shop marks a job done. Returns the raw result.
export function marcarHechaRaw(ordenId: string, actor: Usuario) {
  return servicio().rpc('marcar_hecha', { p_orden: ordenId, p_actor: actor.id });
}

// Payment request for a job at 'hecha', then the system confirms it with the fake provider. Returns the job.
export async function pagarTrabajo(ordenId: string, expiraEn = new Date(Date.now() + 600_000).toISOString()): Promise<Fila> {
  const s = servicio();
  const { error: errorCobro } = await s.rpc('registrar_cobro_servicio', {
    p_orden: ordenId,
    p_proveedor: 'falso',
    p_referencia: `falso-${sufijo()}`,
    p_bolt11: null,
    p_destino: null,
    p_verificar_url: null,
    p_expira_en: expiraEn,
    p_cotizacion_btc: COTIZACION,
  });
  if (errorCobro) throw errorCobro;
  const { data, error } = await s.rpc('confirmar_pago', { p_orden: ordenId, p_actor: null });
  if (error) throw error;
  return data;
}

// Notices for one user, optionally of one type.
export async function avisosDeUsuario(usuario: Usuario, tipo?: string): Promise<Fila[]> {
  let consulta = servicio().from('avisos').select('*').eq('usuario_id', usuario.id);
  if (tipo) consulta = consulta.eq('tipo', tipo);
  const { data, error } = await consulta;
  if (error) throw error;
  return data ?? [];
}

// The shop of a user, by owner id.
export async function negocioDe(dueno: Usuario): Promise<Fila> {
  const { data, error } = await servicio().from('negocios').select('*').eq('usuario_id', dueno.id).single();
  if (error) throw error;
  return data;
}

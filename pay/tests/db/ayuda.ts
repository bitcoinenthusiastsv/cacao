import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Entrega } from '@/lib/cotizacion';
import type { Resultado } from '@/servidor/resultado';
import type { DatosNuevoEnvio } from '@/servidor/transferencias';
import type { Database } from '@/tipos/db';

// Helpers for the database tests, which run against the local Supabase stack. Each test creates its
// own users, so the tests pass on an empty database and on a seeded one.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
// Fixed BTC price, so a Lightning quote does not depend on the live sources.
process.env.PRECIO_FIJO_USD_BTC ??= '100000';

const CLAVE = 'clave-de-prueba-123';
const sinSesion = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let servicioCache: SupabaseClient<Database> | undefined;

// Service-role client. Only the server may use it, and so may these tests.
export function servicio(): SupabaseClient<Database> {
  if (!servicioCache) {
    if (!url || !serviceKey) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Corré las pruebas con --env-file=.env.local.');
    }
    servicioCache = createClient<Database>(url, serviceKey, sinSesion);
  }
  return servicioCache;
}

export function sufijo(): string {
  return Math.random().toString(36).slice(2, 8);
}

export type Usuario = { id: string; telefono: string };

// A fresh user with a random phone from the 5035 range, created with the admin API. Its stored phone
// is digits only, as the database keeps it, so a contact "+5035..." matches it.
export async function usuarioNuevo(nombre = 'Usuaria de prueba'): Promise<Usuario> {
  const telefono = `5035${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const { data, error } = await servicio().auth.admin.createUser({ phone: telefono, password: CLAVE, phone_confirm: true });
  if (error) throw error;
  const { error: errorNombre } = await servicio().from('usuarios').update({ nombre }).eq('id', data.user.id);
  if (errorNombre) throw errorNombre;
  return { id: data.user.id, telefono };
}

let adminCache: Usuario | undefined;

// One administrator per test file.
export async function administrador(): Promise<Usuario> {
  if (!adminCache) {
    const usuario = await usuarioNuevo('Ana');
    const { error } = await servicio().from('usuarios').update({ es_admin: true }).eq('id', usuario.id);
    if (error) throw error;
    adminCache = usuario;
  }
  return adminCache;
}

// A phone that no test user has, in the form a person types it: +503 and eight digits.
export function contactoSinCuenta(): string {
  return `+5038${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
}

// The sender's form values for one transfer. Any field can be changed by the test.
export function datosEnvio(remitente: Usuario, cambios: Partial<DatosNuevoEnvio> = {}): DatosNuevoEnvio {
  return {
    destinatarioNombre: 'Mamá Marta',
    destinatarioContacto: contactoSinCuenta(),
    monedaOrigen: 'USD',
    montoOrigenCentavos: 10_000,
    entrega: 'efectivo' as Entrega,
    nota: '',
    clave: `clave-${sufijo()}${sufijo()}`,
    ...cambios,
  };
}

// The value of a successful result. Fails the test when the result is an error.
export function ok<T>(resultado: Resultado<T>): T {
  if (!resultado.ok) throw new Error(`Se esperaba éxito: ${resultado.codigo}: ${resultado.mensaje}`);
  return resultado.dato;
}

// The error code of a failed result, or null when it succeeded.
export function codigoDe(resultado: Resultado<unknown>): string | null {
  return resultado.ok ? null : resultado.codigo;
}

// The raw row of a transfer, as the database has it.
export async function filaEnvio(envioId: string) {
  const { data, error } = await servicio().from('pay_transferencias').select('*').eq('id', envioId).single();
  if (error) throw error;
  return data;
}

// The funnel events of one transfer, oldest first.
export async function eventosDeEnvio(envioId: string) {
  const { data, error } = await servicio()
    .from('eventos')
    .select('nombre, objeto, valor_usd_centavos, usuario_id')
    .eq('sesion', `envio-${envioId}`)
    .order('id');
  if (error) throw error;
  return data ?? [];
}

// Audit rows of a transfer, oldest first.
export async function auditoriaDeEnvio(envioId: string) {
  const { data, error } = await servicio()
    .from('auditoria')
    .select('accion, actor_id')
    .eq('entidad', 'transferencia')
    .eq('entidad_id', envioId)
    .order('id');
  if (error) throw error;
  return data ?? [];
}

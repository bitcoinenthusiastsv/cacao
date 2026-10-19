import 'server-only';

import { desdeError, exito, fallo, type Resultado } from './resultado';
import { clienteServicio } from './supabase';

// Accounts. Pages and actions pass the signed-in user's id; the database function checks it again.
// The check here gives the user a clear sentence before the round trip.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Length in code points, as the database counts characters.
function largo(texto: string): number {
  return Array.from(texto).length;
}

const NO_ENCONTRADA = fallo('NO_ENCONTRADA', 'No encontramos tu cuenta.');

/**
 * Eight digits, spaces and dashes allowed. The +503 prefix is accepted too, because the field
 * already shows it and people type it anyway. Returns the eight digits, or null.
 */
export function normalizarCelular(texto: string): string | null {
  let digitos = texto.replace(/[\s-]/g, '');
  if (/^\+503\d{8}$/.test(digitos)) digitos = digitos.slice(4);
  else if (/^503\d{8}$/.test(digitos)) digitos = digitos.slice(3);
  return /^\d{8}$/.test(digitos) ? digitos : null;
}

/**
 * A plausible email address, trimmed and lower-cased, at most 254 characters. Returns null when it
 * does not look like one. The mail server still makes the final call.
 */
export function normalizarCorreo(texto: string): string | null {
  const limpio = texto.trim().toLowerCase();
  if (limpio.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio) ? limpio : null;
}

/**
 * Where to send the visitor after sign-in. Only a path on this site; anything else goes to
 * the home page. This is the open-redirect guard, so keep it strict.
 */
export function destinoSeguro(volver: string | string[] | undefined | null): string {
  const texto = Array.isArray(volver) ? volver[0] : volver;
  if (!texto || texto.length > 300) return '/';
  if (!texto.startsWith('/') || texto.startsWith('//') || texto.includes('\\')) return '/';
  // Control characters (tabs, newlines) can change how browsers read the URL.
  if (/[\u0000-\u001f\u007f]/.test(texto)) return '/';
  const origen = 'http://interno.invalid';
  try {
    if (new URL(texto, origen).origin !== origen) return '/';
  } catch {
    return '/';
  }
  // Sign-in must not send the visitor back to sign-in again.
  if (texto === '/entrar' || texto.startsWith('/entrar?') || texto.startsWith('/entrar/')) return '/';
  return texto;
}

/** The profile page, carrying the visitor's destination so they land there after naming themselves. */
export function rutaCuenta(volver: string): string {
  return volver === '/' ? '/cuenta' : `/cuenta?volver=${encodeURIComponent(volver)}`;
}

/** A sign-in or sign-up page, carrying the visitor's destination through the sign-in. */
export function rutaAcceso(ruta: '/entrar' | '/registrarse', volver: string): string {
  return volver === '/' ? ruta : `${ruta}?volver=${encodeURIComponent(volver)}`;
}

function validarNombre(nombre: string): Resultado<string> {
  const limpio = nombre.trim();
  if (largo(limpio) < 2 || largo(limpio) > 80) {
    return fallo('DATOS_INVALIDOS', 'El nombre tiene que tener entre 2 y 80 caracteres.');
  }
  return exito(limpio);
}

/** Sets the display name shown in the header and on transfers. */
export async function actualizarPerfil(usuarioId: string, nombre: string): Promise<Resultado<{ nombre: string }>> {
  if (!UUID.test(usuarioId)) return NO_ENCONTRADA;
  const valido = validarNombre(nombre);
  if (!valido.ok) return valido;

  const { data, error } = await clienteServicio().rpc('actualizar_perfil', {
    p_usuario: usuarioId,
    p_nombre: valido.dato,
  });
  if (error) return desdeError(error);
  return exito({ nombre: data.nombre });
}

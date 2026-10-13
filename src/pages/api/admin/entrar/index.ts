// Signs in to the admin panel with the key (ADMIN_CLAVE) or, in demo mode, without one.
// Failures redirect back to the sign-in page with a short code; the code is never reflected.
import type { APIContext } from 'astro';
import {
  COOKIE_ADMIN,
  claveAdminConfigurada,
  claveCoincide,
  demoActiva,
  firmarSesion,
  opcionesCookie,
} from '../../../../lib/servidor/admin-sesion';

export const prerender = false;

const ENTRADA = '/admin/entrar/';

function ir(destino: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: destino, 'Cache-Control': 'no-store' },
  });
}

export async function POST({ request, cookies, url }: APIContext) {
  const datos = await request.formData().catch(() => null);
  const modo = String(datos?.get('modo') ?? '');

  if (modo === 'demo') {
    if (!demoActiva()) return ir(`${ENTRADA}?error=demo`);
  } else {
    const esperada = claveAdminConfigurada();
    if (!esperada) return ir(`${ENTRADA}?error=desactivado`);
    if (!claveCoincide(String(datos?.get('clave') ?? ''), esperada)) return ir(`${ENTRADA}?error=clave`);
  }

  cookies.set(COOKIE_ADMIN, firmarSesion(), opcionesCookie(url));
  return ir('/admin/');
}

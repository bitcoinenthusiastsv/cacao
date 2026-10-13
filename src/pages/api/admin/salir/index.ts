// Ends the admin session by clearing the cookie.
import type { APIContext } from 'astro';
import { COOKIE_ADMIN } from '../../../../lib/servidor/admin-sesion';

export const prerender = false;

export function POST({ cookies }: APIContext) {
  cookies.delete(COOKIE_ADMIN, { path: '/' });
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin/entrar/', 'Cache-Control': 'no-store' },
  });
}

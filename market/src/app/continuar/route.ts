import { destinoSeguro, rutaCuenta, rutaEntrar } from '@/servidor/cuentas';
import { sesionActual } from '@/servidor/sesion';

// Clerk sends the visitor here after signing in. The destination stays in the `volver` query, so
// this route reads it from the URL on every hop.
export async function GET(request: Request) {
  const volver = destinoSeguro(new URL(request.url).searchParams.get('volver'));

  // Same decision as /entrar: no session goes to sign-in, and a new account without a name sets it first.
  const sesion = await sesionActual();
  let destino = volver;
  if (!sesion) destino = rutaEntrar(volver);
  else if (!sesion.usuario.nombre.trim()) destino = rutaCuenta(volver);

  return new Response(null, {
    status: 307,
    headers: { Location: destino, 'Cache-Control': 'private, no-store' },
  });
}

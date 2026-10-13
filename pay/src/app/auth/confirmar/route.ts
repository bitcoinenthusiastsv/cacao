import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { destinoSeguro, rutaCuenta } from '@/servidor/cuentas';
import { clienteSesion } from '@/servidor/supabase';

type ClienteSesion = Awaited<ReturnType<typeof clienteSesion>>;

// The email kinds a link may carry as token_hash. Anything else is refused before Supabase sees it.
const TIPOS_ENLACE = ['magiclink', 'email', 'signup'];

// The link from the sign-in email lands here, in the browser that asked for the code. It finishes
// the sign-in, then goes where the code path goes. Two shapes arrive:
// - `code`: PKCE, the hosted default email. Supabase sends the visitor here after its own check.
//   Exchanging it needs the verifier cookie that the sign-in request left in this browser.
// - `token_hash` and `type`: an email template that carries the hash itself.
export async function GET(peticion: NextRequest) {
  const parametros = peticion.nextUrl.searchParams;
  const volver = destinoSeguro(parametros.get('volver'));

  // One client for the whole request: after sign-in its session is what the name read runs as.
  const supabase = await clienteSesion();
  const usuarioId = await completarEnlace(supabase, parametros);
  if (!usuarioId) redirect('/entrar?aviso=enlace');

  // Same rule as the code path: a new account without a name sets it first.
  const { data: perfil } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('id', usuarioId)
    .maybeSingle();
  if (!perfil?.nombre?.trim()) redirect(rutaCuenta(volver));
  redirect(volver);
}

// Finishes the sign-in from the link. Returns the user id, or null when the link cannot be used
// (expired, used already, opened in another browser, or missing its parameters).
async function completarEnlace(supabase: ClienteSesion, parametros: URLSearchParams): Promise<string | null> {
  const codigo = parametros.get('code');
  const tokenHash = parametros.get('token_hash');
  const tipo = parametros.get('type');

  try {
    if (codigo) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(codigo);
      if (error) {
        console.error('exchangeCodeForSession:', error.code, error.message);
        return null;
      }
      return data.user?.id ?? null;
    }

    if (tokenHash && tipo && TIPOS_ENLACE.includes(tipo)) {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
      if (error) {
        console.error('verifyOtp (enlace):', error.code, error.message);
        return null;
      }
      return data.user?.id ?? null;
    }
  } catch (error) {
    // A network failure in the auth client throws instead of answering with an error.
    console.error('enlace de correo:', error);
  }
  return null;
}

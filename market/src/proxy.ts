import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Runs before each page request. Its only job is to refresh the Supabase session cookies, so
// Server Components and actions see a valid token. It never redirects: pages decide that.
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(paraEscribir) {
          for (const { name, value } of paraEscribir) {
            request.cookies.set(name, value);
          }
          // Rebuild the response so it carries the request cookies too.
          respuesta = NextResponse.next({ request });
          for (const { name, value, options } of paraEscribir) {
            respuesta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() validates the token with the auth server and refreshes it when needed.
  await supabase.auth.getUser();
  return respuesta;
}

// Static files skip the proxy: images, fonts, the manifest and Next's own assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|webmanifest)$).*)'],
};

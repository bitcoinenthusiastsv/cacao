// Funnel events sent by the story page. The browser may only send the three it can see; the server
// records the rest. Always answers 204: analytics never shows up on the page.
import type { APIContext } from 'astro';
import { hayBase } from '../../lib/servidor/bd';
import { conPlazo, registrarEvento } from '../../lib/servidor/eventos';
import { lectorDe } from '../../lib/servidor/lector';

export const prerender = false;

const DESDE_EL_NAVEGADOR = new Set(['vista_historia', 'vio_muro', 'leyo_completa']);
const SLUG = /^[a-z0-9-]{1,80}$/;

export async function POST(context: APIContext) {
  try {
    const datos: unknown = await context.request.json();
    if (hayBase() && typeof datos === 'object' && datos !== null) {
      const { nombre, objeto, ruta } = datos as Record<string, unknown>;
      if (typeof nombre === 'string' && DESDE_EL_NAVEGADOR.has(nombre)) {
        await conPlazo(
          (async () => {
            const lector = await lectorDe(context);
            await registrarEvento({
              sesion: lector,
              nombre: nombre as 'vista_historia' | 'vio_muro' | 'leyo_completa',
              ruta: typeof ruta === 'string' ? ruta : '/',
              objeto: typeof objeto === 'string' && SLUG.test(objeto) ? objeto : null,
            });
          })(),
        );
      }
    }
  } catch {
    // Dropped on purpose: a broken event must not break the reader's page.
  }
  return new Response(null, { status: 204 });
}

import { EVENTOS_DEL_NAVEGADOR, type NombreEvento, registrarEvento, sesionDeVisitaCreando } from '@/servidor/eventos';

// Events sent by the browser: a product page was seen, or a product was added to the cart.
// Answers 204 with no body, and never reveals whether a row was new (the database de-duplicates).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nombreValido(valor: unknown): valor is NombreEvento {
  return typeof valor === 'string' && (EVENTOS_DEL_NAVEGADOR as readonly string[]).includes(valor);
}

export async function POST(peticion: Request): Promise<Response> {
  let cuerpo: unknown;
  try {
    cuerpo = await peticion.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof cuerpo !== 'object' || cuerpo === null) return new Response(null, { status: 400 });

  const { nombre, objeto, ruta } = cuerpo as Record<string, unknown>;
  if (!nombreValido(nombre)) return new Response(null, { status: 400 });
  // Both browser events name a product, so the object must be a product id.
  if (typeof objeto !== 'string' || !UUID.test(objeto)) return new Response(null, { status: 400 });
  // Only the path is stored: a query string can carry anything.
  if (typeof ruta !== 'string' || !ruta.startsWith('/') || ruta.length > 260) {
    return new Response(null, { status: 400 });
  }

  const sesion = await sesionDeVisitaCreando();
  await registrarEvento({
    nombre,
    sesion,
    usuarioId: null,
    ruta: ruta.split('?')[0].slice(0, 200),
    objeto,
    valorUsdCentavos: null,
  });
  return new Response(null, { status: 204 });
}

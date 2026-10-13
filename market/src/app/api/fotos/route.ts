import { randomUUID } from 'node:crypto';

import { sesionActual } from '@/servidor/sesion';
import { clienteServicio } from '@/servidor/supabase';

const TAMANO_MAXIMO = 3 * 1024 * 1024;

type Formato = { tipo: 'image/jpeg' | 'image/png' | 'image/webp'; extension: 'jpg' | 'png' | 'webp' };

// The type the browser sends and the file name can both be faked. The first bytes cannot,
// for these formats, so the check reads them. SVG and GIF are not on the list on purpose.
function formatoDe(cabecera: Uint8Array): Formato | null {
  const empieza = (firma: number[], desde = 0) =>
    firma.every((byte, i) => cabecera[desde + i] === byte);

  if (empieza([0xff, 0xd8, 0xff])) return { tipo: 'image/jpeg', extension: 'jpg' };
  if (empieza([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { tipo: 'image/png', extension: 'png' };
  }
  // WebP is "RIFF", four size bytes, then "WEBP".
  if (empieza([0x52, 0x49, 0x46, 0x46]) && empieza([0x57, 0x45, 0x42, 0x50], 8)) {
    return { tipo: 'image/webp', extension: 'webp' };
  }
  return null;
}

function error(codigo: string, mensaje: string, estado: number) {
  return Response.json({ codigo, mensaje }, { status: estado });
}

export async function POST(request: Request) {
  const sesion = await sesionActual();
  if (!sesion) return error('NO_AUTORIZADO', 'Entrá a tu cuenta para subir fotos.', 401);
  if (!sesion.negocio) return error('NO_PERMITIDO', 'Primero tenés que registrar tu negocio.', 403);

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return error('DATOS_INVALIDOS', 'Elegí una foto para subir.', 400);
  }

  const foto = formulario.get('foto');
  if (!(foto instanceof File) || foto.size === 0) {
    return error('DATOS_INVALIDOS', 'Elegí una foto para subir.', 400);
  }
  if (foto.size > TAMANO_MAXIMO) {
    return error('DATOS_INVALIDOS', 'La foto pesa más de 3 MB. Probá con una más chica.', 413);
  }

  const formato = formatoDe(new Uint8Array(await foto.slice(0, 12).arrayBuffer()));
  if (!formato) {
    return error('DATOS_INVALIDOS', 'Solo podés subir fotos en JPG, PNG o WebP.', 415);
  }

  // The shop's id comes from the session. A random name means no photo can overwrite another.
  const ruta = `${sesion.negocio.id}/${randomUUID()}.${formato.extension}`;
  const bucket = clienteServicio().storage.from('productos');

  const { error: fallo } = await bucket.upload(ruta, foto, {
    contentType: formato.tipo,
    upsert: false,
    cacheControl: '31536000',
  });
  if (fallo) {
    console.error('Subir foto:', fallo.message);
    return error('ERROR', 'No pudimos guardar la foto. Probá de nuevo en un momento.', 500);
  }

  const { data } = bucket.getPublicUrl(ruta);
  return Response.json({ url: data.publicUrl });
}

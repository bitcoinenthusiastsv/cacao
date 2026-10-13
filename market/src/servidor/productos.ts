import 'server-only';

import { revalidatePath } from 'next/cache';

import {
  enteroEnRango,
  precioACentavos,
  STOCK_MAXIMO,
} from '@/app/mi-negocio/productos/_comun/precio';
import type { DatosProducto, ProductoMio } from '@/app/mi-negocio/productos/_comun/tipos';

import { desdeError, exito, fallo, type Resultado } from './resultado';
import { clienteServicio } from './supabase';

export { categorias } from './catalogo';
export type { Categoria } from './catalogo';

const MAXIMO_FOTOS = 4;

// Ids come from the URL or the form. Anything that is not a UUID cannot be a row.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (id: string) => UUID.test(id);

// The service client ignores row-level security, so every read here filters by the shop.
// Sellers also need their paused products, which the public policy hides.
const COLUMNAS =
  'id, nombre, descripcion, unidad, precio_usd_centavos, stock, activo, fotos, categoria_id, categorias(nombre)';

type FilaProducto = {
  id: string;
  nombre: string;
  descripcion: string;
  unidad: string;
  precio_usd_centavos: number;
  stock: number;
  activo: boolean;
  fotos: string[];
  categoria_id: number;
  categorias: { nombre: string } | null;
};

function aProducto(fila: FilaProducto): ProductoMio {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    unidad: fila.unidad,
    precioUsdCentavos: fila.precio_usd_centavos,
    stock: fila.stock,
    activo: fila.activo,
    categoriaId: fila.categoria_id,
    categoriaNombre: fila.categorias?.nombre ?? '',
    fotos: fila.fotos,
  };
}

/** All products of a shop: active first, then by name. */
export async function misProductos(negocioId: string): Promise<ProductoMio[]> {
  if (!esUuid(negocioId)) return [];

  const { data, error } = await clienteServicio()
    .from('productos')
    .select(COLUMNAS)
    .eq('negocio_id', negocioId);
  if (error) throw new Error(`No pudimos leer tus productos: ${error.message}`);

  const filas = (data ?? []) as unknown as FilaProducto[];
  return filas
    .map(aProducto)
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
}

/** One product of the shop, or null when it is not there or belongs to another shop. */
export async function miProducto(negocioId: string, productoId: string): Promise<ProductoMio | null> {
  if (!esUuid(negocioId) || !esUuid(productoId)) return null;

  const { data, error } = await clienteServicio()
    .from('productos')
    .select(COLUMNAS)
    .eq('id', productoId)
    .eq('negocio_id', negocioId)
    .maybeSingle();
  if (error) throw new Error(`No pudimos leer el producto: ${error.message}`);
  return data ? aProducto(data as unknown as FilaProducto) : null;
}

async function negocioDeUsuario(usuarioId: string): Promise<Resultado<{ id: string }>> {
  if (!esUuid(usuarioId)) return fallo('NO_PERMITIDO', 'Entrá a tu cuenta para seguir.');

  const { data, error } = await clienteServicio()
    .from('negocios')
    .select('id')
    .eq('usuario_id', usuarioId)
    .maybeSingle();
  if (error) return desdeError(error);
  if (!data) return fallo('NO_PERMITIDO', 'Primero tenés que registrar tu negocio.');
  return exito({ id: data.id });
}

// Photos come from two places: this project's bucket, under the shop's own folder, and the seeded
// files in public/productos. Any other URL would let a seller point at arbitrary content.
const ARCHIVO_SUBIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const RUTA_LOCAL = /^\/productos\/[A-Za-z0-9_\-/]+\.(jpg|jpeg|png|webp)$/;

function fotoPermitida(url: string, negocioId: string): boolean {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const prefijo = `${base}/storage/v1/object/public/productos/${negocioId}/`;
  if (base && url.startsWith(prefijo)) return ARCHIVO_SUBIDO.test(url.slice(prefijo.length));
  return RUTA_LOCAL.test(url);
}

function validarFotos(fotos: unknown, negocioId: string): Resultado<string[]> {
  if (!Array.isArray(fotos) || !fotos.every((f): f is string => typeof f === 'string')) {
    return fallo('DATOS_INVALIDOS', 'Una de las fotos no es válida. Subila de nuevo.');
  }
  if (fotos.length > MAXIMO_FOTOS) {
    return fallo('DATOS_INVALIDOS', `Un producto puede tener hasta ${MAXIMO_FOTOS} fotos.`);
  }
  if (!fotos.every((f) => fotoPermitida(f, negocioId))) {
    return fallo('DATOS_INVALIDOS', 'Una de las fotos no es válida. Subila de nuevo.');
  }
  return exito(fotos);
}

// The catalogue pages read on every request, so this is for the shop's own list and for
// anything that might have cached the old values.
function revalidarCatalogo(): void {
  revalidatePath('/');
  revalidatePath('/productos/[id]', 'page');
  revalidatePath('/negocios/[id]', 'page');
  revalidatePath('/mi-negocio/productos');
}

type CamposProducto = {
  categoria: number;
  nombre: string;
  descripcion: string;
  unidad: string;
  precioCentavos: number;
  stock: number;
  activo: boolean;
  fotos: string[];
};

async function escribirProducto(
  usuarioId: string,
  productoId: string | null,
  campos: CamposProducto,
): Promise<Resultado<{ id: string }>> {
  // The generated types leave null out of uuid arguments, but the function takes null to create.
  const idProducto = productoId as unknown as string;

  const { data, error } = await clienteServicio().rpc('guardar_producto', {
    p_usuario: usuarioId,
    p_producto: idProducto,
    p_categoria: campos.categoria,
    p_nombre: campos.nombre,
    p_descripcion: campos.descripcion,
    p_unidad: campos.unidad,
    p_precio: campos.precioCentavos,
    p_stock: campos.stock,
    p_activo: campos.activo,
    p_fotos: campos.fotos,
  });
  if (error) return desdeError(error);

  revalidarCatalogo();
  return exito({ id: data.id });
}

function textoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/** Creates a product (datos.id null) or edits one of the user's shop. */
export async function guardarProducto(
  usuarioId: string,
  datos: DatosProducto,
): Promise<Resultado<{ id: string }>> {
  const negocio = await negocioDeUsuario(usuarioId);
  if (!negocio.ok) return negocio;

  if (datos.id !== null && !esUuid(datos.id)) {
    return fallo('NO_ENCONTRADA', 'No encontramos ese producto en tu negocio.');
  }

  const categoria = enteroEnRango(textoDe(datos.categoria), 1, 32767);
  if (categoria === null) return fallo('DATOS_INVALIDOS', 'Elegí una categoría válida.');

  const precio = precioACentavos(textoDe(datos.precio));
  if (!precio.ok) return fallo('DATOS_INVALIDOS', precio.mensaje);

  const stock = enteroEnRango(textoDe(datos.stock), 0, STOCK_MAXIMO);
  if (stock === null) {
    return fallo('DATOS_INVALIDOS', `El stock tiene que ser un número entero entre 0 y ${STOCK_MAXIMO}.`);
  }

  if (typeof datos.activo !== 'boolean') {
    return fallo('DATOS_INVALIDOS', 'Indicá si el producto está activo.');
  }

  const fotos = validarFotos(datos.fotos, negocio.dato.id);
  if (!fotos.ok) return fotos;

  return escribirProducto(usuarioId, datos.id, {
    categoria,
    // The database checks the length of the texts and says so in Spanish.
    nombre: textoDe(datos.nombre).trim(),
    descripcion: textoDe(datos.descripcion).trim(),
    unidad: textoDe(datos.unidad).trim(),
    precioCentavos: precio.centavos,
    stock,
    activo: datos.activo,
    fotos: fotos.dato,
  });
}

/** Changes only the stock. Every other field is kept as it is. */
export async function cambiarStock(
  usuarioId: string,
  productoId: string,
  stock: number,
): Promise<Resultado<{ stock: number }>> {
  if (!Number.isInteger(stock) || stock < 0 || stock > STOCK_MAXIMO) {
    return fallo('DATOS_INVALIDOS', `El stock tiene que ser un número entero entre 0 y ${STOCK_MAXIMO}.`);
  }

  const negocio = await negocioDeUsuario(usuarioId);
  if (!negocio.ok) return negocio;

  try {
    const actual = await miProducto(negocio.dato.id, productoId);
    if (!actual) return fallo('NO_ENCONTRADA', 'No encontramos ese producto en tu negocio.');

    const r = await escribirProducto(usuarioId, actual.id, {
      categoria: actual.categoriaId,
      nombre: actual.nombre,
      descripcion: actual.descripcion,
      unidad: actual.unidad,
      precioCentavos: actual.precioUsdCentavos,
      stock,
      activo: actual.activo,
      fotos: actual.fotos,
    });
    if (!r.ok) return r;
    return exito({ stock });
  } catch (error) {
    return desdeError(error);
  }
}

/** Pauses or activates a product. Every other field is kept as it is. */
export async function cambiarActivo(
  usuarioId: string,
  productoId: string,
  activo: boolean,
): Promise<Resultado<{ activo: boolean }>> {
  if (typeof activo !== 'boolean') return fallo('DATOS_INVALIDOS', 'Indicá si el producto está activo.');

  const negocio = await negocioDeUsuario(usuarioId);
  if (!negocio.ok) return negocio;

  try {
    const actual = await miProducto(negocio.dato.id, productoId);
    if (!actual) return fallo('NO_ENCONTRADA', 'No encontramos ese producto en tu negocio.');

    const r = await escribirProducto(usuarioId, actual.id, {
      categoria: actual.categoriaId,
      nombre: actual.nombre,
      descripcion: actual.descripcion,
      unidad: actual.unidad,
      precioCentavos: actual.precioUsdCentavos,
      stock: actual.stock,
      activo,
      fotos: actual.fotos,
    });
    if (!r.ok) return r;
    return exito({ activo });
  } catch (error) {
    return desdeError(error);
  }
}

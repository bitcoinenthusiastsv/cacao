// Shapes shared by the server functions and the client forms. Plain data only: no imports from
// src/servidor here, because Client Components import this file.

export type CategoriaOpcion = { id: number; nombre: string };

export type ProductoMio = {
  id: string;
  nombre: string;
  descripcion: string;
  unidad: string;
  precioUsdCentavos: number;
  stock: number;
  activo: boolean;
  categoriaId: number;
  categoriaNombre: string;
  fotos: string[];
};

// What the form sends. Everything arrives as text and the server checks it again.
export type DatosProducto = {
  /** Null creates a product; a UUID edits one. */
  id: string | null;
  nombre: string;
  descripcion: string;
  unidad: string;
  categoria: string;
  /** USD as typed, for example "3.50". */
  precio: string;
  stock: string;
  activo: boolean;
  /** Public photo URLs, first one is the cover. */
  fotos: string[];
};

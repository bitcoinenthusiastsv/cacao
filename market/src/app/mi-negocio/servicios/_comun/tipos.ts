// Shapes shared by the server actions and the client forms. Plain data only: no imports from
// src/servidor here, because Client Components import this file.

import type { TipoPrecio } from '@/lib/servicios';

export type CategoriaOpcion = { id: number; nombre: string };

// What the form sends. Everything arrives as text and the action checks it again.
export type DatosFormularioServicio = {
  /** Null creates a service; a UUID edits one of the shop's services. */
  id: string | null;
  categoria: string;
  titulo: string;
  descripcion: string;
  zona: string;
  tipoPrecio: TipoPrecio;
  /** USD as typed, for example "5.50". Null for a quoted service: the field is hidden and not sent. */
  precio: string | null;
  /** Null for a quoted service. */
  unidad: string | null;
  activo: boolean;
  /** Public photo URLs. A service takes one photo at most. */
  fotos: string[];
};

// The starting values of the form: empty for a new service, the stored ones for an edit.
export type ValoresServicio = {
  id: string | null;
  categoriaId: number | null;
  titulo: string;
  descripcion: string;
  zona: string;
  tipoPrecio: TipoPrecio;
  precio: string;
  unidad: string;
  activo: boolean;
  fotos: string[];
};

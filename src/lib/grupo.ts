import { TRAVEL_URL } from './travel';

/** The products of the Cacao group. Each product keeps its own copy of this list. */
export type ProductoId = 'media' | 'travel' | 'market' | 'pay' | 'ledger' | 'juego';

export interface Producto {
  id: ProductoId;
  /** The second half of the lower case wordmark; "cacao" comes first in the heavier weight. */
  marca: string;
  url: string;
  linea: string;
}

export const GRUPO_FRASE =
  'Cacao es un grupo de productos hechos en El Salvador para que el dinero circule cerca: llega, se gasta en lo local, se declara y se cuenta.';

// Addresses are constants, except the Travel link, which follows the environment like the rest of Media.
export const PRODUCTOS: Producto[] = [
  { id: 'media', marca: 'media', url: 'https://cacao-media.vercel.app', linea: 'Historias de El Salvador, grano a grano' },
  { id: 'travel', marca: 'travel', url: TRAVEL_URL, linea: 'Experiencias en El Salvador, con precio en sats' },
  { id: 'market', marca: 'market', url: 'https://cacao-market.vercel.app', linea: 'Productos y servicios locales, pagados en sats' },
  { id: 'pay', marca: 'pay', url: 'https://cacao-pay.vercel.app', linea: 'Mandá dinero a El Salvador y mirá cada centavo' },
  { id: 'ledger', marca: 'ledger', url: 'https://cacao-ledger.vercel.app', linea: 'Cobrá y declará: la venta y su factura electrónica' },
  { id: 'juego', marca: 'juego', url: 'https://cacao-juego.vercel.app', linea: 'Un quiz sobre El Salvador, con sats simulados' },
];

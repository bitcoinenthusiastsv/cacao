import 'server-only';

import { clienteServicio } from './supabase';

// Funnel steps of Cacao Pay. Each name must be allowed for the site 'pay' in eventos_permitidos.
export type EventoPay = 'vio_cotizacion' | 'inicio_envio' | 'creo_envio' | 'envio_completado';

export type DatosEvento = {
  nombre: EventoPay;
  // A random id the browser keeps for one visit (8 to 64 characters); server events build their own.
  sesion: string;
  usuarioId: string | null;
  ruta: string;
  objeto?: string | null;
  /** Value in US cents, for the steps that carry an amount. */
  valorUsdCentavos?: number | null;
};

// The database accepts a null for these parameters, but the database types say string.
const NULO = null as unknown as string;

/**
 * Records one funnel step. Never throws: a failed write is logged and the transfer goes on. A repeat
 * of the same step inside the hour is ignored by the database.
 */
export async function registrarEvento(datos: DatosEvento): Promise<void> {
  try {
    const { error } = await clienteServicio().rpc('registrar_evento', {
      p_sitio: 'pay',
      p_nombre: datos.nombre,
      p_sesion: datos.sesion,
      p_usuario: datos.usuarioId ?? NULO,
      p_ruta: datos.ruta.slice(0, 200),
      p_objeto: datos.objeto ?? NULO,
      p_valor: datos.valorUsdCentavos ?? (null as unknown as number),
    });
    if (error) console.error('registrar_evento:', error.message);
  } catch (error) {
    console.error('registrar_evento:', error instanceof Error ? error.message : error);
  }
}

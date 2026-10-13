// Funnel events for Cacao Media. Server only: the browser asks, the server writes the row.
// Recording never breaks the page: a failure is logged and the caller goes on.
import { bd, hayBase, leerError } from './bd';

export type NombreEvento = 'vista_historia' | 'vio_muro' | 'leyo_completa' | 'creo_cobro' | 'pago';

export interface Evento {
  sesion: string;
  nombre: NombreEvento;
  ruta: string;
  objeto?: string | null;
  valorUsdCentavos?: number | null;
}

// A slow database must not hold the reader's page or beacon for long.
const PLAZO_MS = 2500;

/** Runs a promise, but gives up after `ms`. Resolves to undefined when it gives up. */
export function conPlazo<T>(promesa: PromiseLike<T>, ms: number = PLAZO_MS): Promise<T | undefined> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<undefined>((resolver) => {
    temporizador = setTimeout(() => resolver(undefined), ms);
  });
  return Promise.race([promesa, plazo]).finally(() => clearTimeout(temporizador));
}

export async function registrarEvento(evento: Evento): Promise<void> {
  if (!hayBase()) return;
  try {
    const { error } = await conPlazo(
      bd().rpc('registrar_evento', {
        p_sitio: 'media',
        p_nombre: evento.nombre,
        p_sesion: evento.sesion,
        p_usuario: null,
        p_ruta: evento.ruta.slice(0, 200),
        p_objeto: evento.objeto ?? null,
        p_valor: evento.valorUsdCentavos ?? null,
      }),
    ) ?? {};
    if (error) console.error('Evento no registrado:', leerError(error).mensaje);
  } catch (error) {
    console.error('Evento no registrado:', leerError(error).mensaje);
  }
}

// The date range of the funnel page. Pure: no I/O, so the tests and the page read the same rules.
// El Salvador keeps UTC-6 all year, so the day boundaries are fixed offsets.

const ZONA = 'America/El_Salvador';
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_POR_DEFECTO = 30;
const DIAS_MAXIMOS = 366;
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type RangoEmbudo = {
  /** Days as the page shows and reads them, YYYY-MM-DD in El Salvador. */
  desdeFecha: string;
  hastaFecha: string;
  /** Instants for the query: from the start of desdeFecha, up to but not including the day after hastaFecha. */
  desde: string;
  hasta: string;
  /** Null when the dates the visitor sent were used as they are; a sentence otherwise. */
  aviso: string | null;
};

/** Today's date in El Salvador, as YYYY-MM-DD. */
export function fechaHoySalvador(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

// A real calendar date, not just a shape: "2026-02-30" is refused.
function fechaValida(texto: string): boolean {
  if (!FORMATO_FECHA.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia) + dias * DIA_MS).toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  const [a, m, d] = desde.split('-').map(Number);
  const [b, n, e] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(b, n - 1, e) - Date.UTC(a, m - 1, d)) / DIA_MS);
}

function construir(desdeFecha: string, hastaFecha: string, aviso: string | null): RangoEmbudo {
  return {
    desdeFecha,
    hastaFecha,
    desde: `${desdeFecha}T00:00:00-06:00`,
    hasta: `${sumarDias(hastaFecha, 1)}T00:00:00-06:00`,
    aviso,
  };
}

/**
 * The range for the query string values. Missing values fall back to the last 30 days ending today.
 * Values that are not real dates, or a range that is backwards or longer than a year, fall back too,
 * and the page says so.
 */
export function rangoDesde(valorDesde: string | undefined, valorHasta: string | undefined, ahora: Date = new Date()): RangoEmbudo {
  const hoy = fechaHoySalvador(ahora);
  const porDefecto = () => construir(sumarDias(hoy, -(DIAS_POR_DEFECTO - 1)), hoy, null);

  if (valorDesde === undefined && valorHasta === undefined) return porDefecto();
  const desde = valorDesde ?? sumarDias(valorHasta ?? hoy, -(DIAS_POR_DEFECTO - 1));
  const hasta = valorHasta ?? hoy;

  const invalida = !fechaValida(desde) || !fechaValida(hasta);
  if (invalida) {
    return { ...porDefecto(), aviso: 'Una de las fechas no es válida. Mostramos los últimos 30 días.' };
  }
  if (diasEntre(desde, hasta) < 0) {
    return { ...porDefecto(), aviso: 'La fecha de inicio es posterior a la de fin. Mostramos los últimos 30 días.' };
  }
  if (diasEntre(desde, hasta) >= DIAS_MAXIMOS) {
    return { ...porDefecto(), aviso: 'El periodo no puede pasar de un año. Mostramos los últimos 30 días.' };
  }
  return construir(desde, hasta, null);
}

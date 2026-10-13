// Dates in El Salvador time, whatever the phone's clock says. The same options run on the server
// and in the browser, so the first paint and the live messages read the same.
const formato = new Intl.DateTimeFormat('es-SV', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/El_Salvador',
});

/** "12 oct, 3:40 p. m." */
export function fechaCorta(iso: string): string {
  return formato.format(new Date(iso));
}

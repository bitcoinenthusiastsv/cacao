const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** 6 OCT 2026 — dates in frontmatter are plain days, so read them as UTC. */
export const fechaCorta = (f: Date): string =>
  `${f.getUTCDate()} ${MESES[f.getUTCMonth()]} ${f.getUTCFullYear()}`;

export const fechaIso = (f: Date): string => f.toISOString().slice(0, 10);

/** Prices are in satoshis: 120 sats. */
export const precio = (p: number): string => `${p.toLocaleString('en-US')} sats`;

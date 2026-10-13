// Paging for the order lists. Plain functions, so server pages and the pager component can both use them.

export const TAMANO_PAGINA = 30;

/** Reads ?pagina=N. Anything that is not a whole number from 1 up is page 1. */
export function leerPagina(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto || !/^\d{1,4}$/.test(texto)) return 1;
  const numero = Number(texto);
  return numero >= 1 ? numero : 1;
}

/** One page of a list. A page past the end shows the last page. */
export function paginar<T>(items: T[], pagina: number) {
  const paginas = Math.max(1, Math.ceil(items.length / TAMANO_PAGINA));
  const actual = Math.min(pagina, paginas);
  return {
    items: items.slice((actual - 1) * TAMANO_PAGINA, actual * TAMANO_PAGINA),
    pagina: actual,
    paginas,
    total: items.length,
  };
}

// One decimal place with a comma, as Salvadorans write it: 4.5 -> "4,5".
export function formatoNumero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

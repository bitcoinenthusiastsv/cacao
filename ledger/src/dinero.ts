// Money is integer US cents everywhere. Floats are only used at the edges
// (parsing user input and printing), never for arithmetic.

import { ErrorLedger } from "./errores.ts";

export const IVA_PORCENTAJE = 13;

// Consumer invoice (01): the price shown already contains IVA. The IVA inside
// a gross amount is gross * 13 / 113. 113 is odd, so the division never lands
// exactly on .5 and round-half-up needs no tie rule: round(n / d) = floor((2n + d) / 2d).
export function ivaIncluido(centavos: number): number {
  const n = centavos * IVA_PORCENTAJE;
  return Math.floor((2 * n + 113) / 226);
}

// Business invoice (03): prices are net and IVA is added on top.
// Half-up rounding in cents: floor((13 * c + 50) / 100).
export function ivaSobreNeto(centavos: number): number {
  return Math.floor((IVA_PORCENTAJE * centavos + 50) / 100);
}

export interface LineaPrecio {
  descripcion: string;
  cantidad: number;
  // Unit price in cents. Includes IVA for a consumer sale, excludes it for a business sale.
  precioCentavos: number;
}

export interface LineaCalculada {
  descripcion: string;
  cantidad: number;
  precioUnitarioCentavos: number;
  // Value the DTE reports as ventaGravada: gross for 01, net for 03.
  ventaCentavos: number;
  ivaCentavos: number;
  netoCentavos: number;
  totalCentavos: number;
}

export interface Totales {
  // totalGravada in the DTE: gross for 01, net for 03.
  gravadoCentavos: number;
  ivaCentavos: number;
  // montoTotalOperacion and totalPagar.
  totalCentavos: number;
  netoCentavos: number;
}

export type Modalidad = "con-iva" | "sin-iva";

// Rounding rule: IVA is rounded to the cent on each line, and every total is the
// sum of rounded line values. A reader can recompute any total from the lines and
// get the same cent. See docs/hallazgos.md.
export function calcularLinea(linea: LineaPrecio, modalidad: Modalidad): LineaCalculada {
  if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) {
    throw new RangeError("La cantidad debe ser un entero mayor que cero.");
  }
  if (!Number.isSafeInteger(linea.precioCentavos) || linea.precioCentavos < 0) {
    throw new RangeError("El precio debe ser un monto en centavos no negativo.");
  }
  const bruto = linea.precioCentavos * linea.cantidad;
  if (modalidad === "con-iva") {
    const iva = ivaIncluido(bruto);
    return {
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      precioUnitarioCentavos: linea.precioCentavos,
      ventaCentavos: bruto,
      ivaCentavos: iva,
      netoCentavos: bruto - iva,
      totalCentavos: bruto,
    };
  }
  const iva = ivaSobreNeto(bruto);
  return {
    descripcion: linea.descripcion,
    cantidad: linea.cantidad,
    precioUnitarioCentavos: linea.precioCentavos,
    ventaCentavos: bruto,
    ivaCentavos: iva,
    netoCentavos: bruto,
    totalCentavos: bruto + iva,
  };
}

export function calcularTotales(lineas: LineaPrecio[], modalidad: Modalidad): { lineas: LineaCalculada[]; totales: Totales } {
  const calculadas = lineas.map((l) => calcularLinea(l, modalidad));
  const suma = (f: (l: LineaCalculada) => number) => calculadas.reduce((acc, l) => acc + f(l), 0);
  const iva = suma((l) => l.ivaCentavos);
  const neto = suma((l) => l.netoCentavos);
  const gravado = suma((l) => l.ventaCentavos);
  const total = modalidad === "con-iva" ? gravado : gravado + iva;
  return {
    lineas: calculadas,
    totales: {
      gravadoCentavos: gravado,
      ivaCentavos: iva,
      totalCentavos: total,
      netoCentavos: neto,
    },
  };
}

// "3.50" -> 350. Rejects anything that is not a plain decimal with at most two places.
export function centavosDesdeTexto(texto: string): number {
  const limpio = texto.trim();
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(limpio);
  if (!m) {
    throw new ErrorLedger(`"${texto}" no es un monto válido en dólares (usá la forma 3.50).`);
  }
  const entero = Number(m[1]);
  const decimales = (m[2] ?? "").padEnd(2, "0");
  return entero * 100 + Number(decimales);
}

// 350 -> "3.50" as a string, for DTE amounts (always two decimals).
export function montoDte(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

export function formatoUsd(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const entero = Math.floor(abs / 100).toLocaleString("en-US");
  const cents = String(abs % 100).padStart(2, "0");
  return `${signo}$${entero}.${cents}`;
}

export function formatoSats(sats: number): string {
  return `${sats.toLocaleString("en-US")} sats`;
}

// Spanish words for a USD amount, as the DTE field totalLetras expects, e.g. "CUATRO 10/100 USD".
const UNIDADES = ["CERO", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE"];
const VEINTIS = ["VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function menosDeMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c] ?? "");
  if (r > 0) {
    if (r <= 20) partes.push(UNIDADES[r] ?? "");
    else if (r < 30) partes.push(VEINTIS[r - 21] ?? "");
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u === 0 ? (DECENAS[d] ?? "") : `${DECENAS[d]} Y ${UNIDADES[u]}`);
    }
  }
  return partes.join(" ");
}

export function enLetrasUsd(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0 || centavos >= 1_000_000_000 * 100) {
    throw new RangeError("Monto fuera del rango para escribirlo en letras.");
  }
  const dolares = Math.floor(centavos / 100);
  const cents = String(centavos % 100).padStart(2, "0");
  let texto: string;
  if (dolares === 0) texto = "CERO";
  else {
    const millones = Math.floor(dolares / 1_000_000);
    const miles = Math.floor((dolares % 1_000_000) / 1000);
    const resto = dolares % 1000;
    const partes: string[] = [];
    if (millones > 0) partes.push(millones === 1 ? "UN MILLON" : `${menosDeMil(millones)} MILLONES`);
    if (miles > 0) partes.push(miles === 1 ? "MIL" : `${menosDeMil(miles)} MIL`);
    if (resto > 0) partes.push(menosDeMil(resto));
    texto = partes.join(" ");
  }
  return `${texto} ${cents}/100 USD`;
}

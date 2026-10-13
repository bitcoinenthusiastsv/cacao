import { canonico } from "./atestacion.ts";
import { ErrorLedger } from "./errores.ts";
import { formatoSats, formatoUsd } from "./dinero.ts";
import { tasaCentavosPorBtc } from "./pagos/blink.ts";
import type { Pago } from "./pagos/tipos.ts";
import {
  crearTicket,
  guardarTicket,
  registrarPago,
  ticketConHashDePago,
  ticketDeOrigen,
  validarEntrada,
  type LineaTicket,
  type Ticket,
} from "./ticket.ts";

// Reads one paid order exported from CacaoMarket and turns it into a paid ticket.
// The file format is documented in docs/importar-market.md. Nothing here touches a database
// or the network: the export is a file, and producing it is a separate step.

export const FORMATO_ORDEN = "cacaomarket-orden/1";

const CLAVES_ORDEN = ["formato", "numero", "pagadaEn", "tipoCliente", "lineas", "totalCentavos", "pago"];
const CLAVES_LINEA = ["descripcion", "cantidad", "precioCentavos"];
const CLAVES_LIGHTNING = ["riel", "sats", "tasaUsdPorBtc", "tasaFuente", "paymentHash"];
const CLAVES_EFECTIVO = ["riel"];
const ISO_CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export type PagoOrden =
  | { riel: "lightning"; sats: number; tasaUsdPorBtc: string; tasaFuente: string; paymentHash: string }
  | { riel: "efectivo" };

export interface OrdenMarket {
  numero: string;
  pagadaEn: string; // ISO-8601, as the order was paid
  lineas: LineaTicket[]; // prices include IVA, as the consumer sees them
  totalCentavos: number;
  pago: PagoOrden;
}

export interface ResultadoImportacion {
  ticket: Ticket;
  // False when the order was already imported: nothing new was written.
  nueva: boolean;
}

function soloClaves(o: Record<string, unknown>, permitidas: string[], donde: string): void {
  for (const clave of Object.keys(o)) {
    if (!permitidas.includes(clave)) {
      throw new ErrorLedger(`El pedido tiene un campo que no conoce en ${donde}: "${clave}".`);
    }
  }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function enteroPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}

function leerPago(raw: unknown): PagoOrden {
  if (!esObjeto(raw)) throw new ErrorLedger("El pedido no trae el pago, o el pago no es un objeto.");
  if (raw.riel === "efectivo") {
    soloClaves(raw, CLAVES_EFECTIVO, "pago");
    return { riel: "efectivo" };
  }
  if (raw.riel !== "lightning") {
    throw new ErrorLedger('El riel del pago debe ser "lightning" o "efectivo".');
  }
  soloClaves(raw, CLAVES_LIGHTNING, "pago");
  if (!enteroPositivo(raw.sats)) throw new ErrorLedger("Los sats del pago deben ser un entero mayor que cero.");
  if (typeof raw.tasaUsdPorBtc !== "string" || !/^\d+\.\d{2}$/.test(raw.tasaUsdPorBtc)) {
    throw new ErrorLedger('La tasa del pago debe ser un texto con dos decimales, por ejemplo "36939.92".');
  }
  if (typeof raw.tasaFuente !== "string" || raw.tasaFuente.trim().length === 0) {
    throw new ErrorLedger("El pago de Lightning necesita la fuente de la tasa (tasaFuente).");
  }
  if (typeof raw.paymentHash !== "string" || !/^[0-9a-f]{64}$/.test(raw.paymentHash)) {
    throw new ErrorLedger("La referencia del pago (paymentHash) debe tener 64 caracteres hexadecimales en minúscula.");
  }
  return {
    riel: "lightning",
    sats: raw.sats,
    tasaUsdPorBtc: raw.tasaUsdPorBtc,
    tasaFuente: raw.tasaFuente.trim(),
    paymentHash: raw.paymentHash,
  };
}

// Strict reading of the order file. Every refusal is one sentence in Spanish.
export function leerOrdenMarket(raw: unknown): OrdenMarket {
  if (!esObjeto(raw)) throw new ErrorLedger("El archivo del pedido debe ser un objeto JSON.");
  soloClaves(raw, CLAVES_ORDEN, "el pedido");
  if (raw.formato !== FORMATO_ORDEN) {
    throw new ErrorLedger(`El archivo no es un pedido de CacaoMarket con formato "${FORMATO_ORDEN}".`);
  }
  if (typeof raw.numero !== "string" || !/^[A-Za-z0-9-]{1,20}$/.test(raw.numero)) {
    throw new ErrorLedger("El número de pedido debe tener de 1 a 20 letras, números o guiones.");
  }
  if (typeof raw.pagadaEn !== "string" || !ISO_CON_ZONA.test(raw.pagadaEn) || Number.isNaN(Date.parse(raw.pagadaEn))) {
    throw new ErrorLedger("La fecha de pago debe ser ISO-8601 con zona horaria, por ejemplo 2026-10-12T19:20:00.000Z.");
  }
  if (raw.tipoCliente !== undefined && raw.tipoCliente !== "consumidor") {
    throw new ErrorLedger(
      'Por ahora solo se importan pedidos de consumidor final. Un pedido a contribuyente necesita precios sin IVA y los datos fiscales del receptor, que el formato todavía no trae.',
    );
  }
  if (!Array.isArray(raw.lineas) || raw.lineas.length === 0) {
    throw new ErrorLedger("El pedido necesita al menos una línea.");
  }
  const lineas: LineaTicket[] = raw.lineas.map((linea: unknown, i: number) => {
    if (!esObjeto(linea)) throw new ErrorLedger(`La línea ${i + 1} no es un objeto.`);
    soloClaves(linea, CLAVES_LINEA, `la línea ${i + 1}`);
    if (typeof linea.descripcion !== "string" || linea.descripcion.trim().length === 0) {
      throw new ErrorLedger(`La línea ${i + 1} necesita una descripción.`);
    }
    if (!enteroPositivo(linea.cantidad)) throw new ErrorLedger(`La cantidad de la línea ${i + 1} debe ser un entero mayor que cero.`);
    if (!enteroPositivo(linea.precioCentavos)) {
      throw new ErrorLedger(`El precio de la línea ${i + 1} debe ser un monto en centavos mayor que cero.`);
    }
    return { descripcion: linea.descripcion.trim(), cantidad: linea.cantidad, precioCentavos: linea.precioCentavos };
  });
  if (!enteroPositivo(raw.totalCentavos)) {
    throw new ErrorLedger("El total del pedido debe ser un monto en centavos mayor que cero.");
  }
  const sumaLineas = lineas.reduce((acc, l) => acc + l.precioCentavos * l.cantidad, 0);
  if (sumaLineas !== raw.totalCentavos) {
    throw new ErrorLedger(
      `La suma de las líneas es ${formatoUsd(sumaLineas)} y el total del pedido dice ${formatoUsd(raw.totalCentavos)}; no cuadran.`,
    );
  }
  const pago = leerPago(raw.pago);
  if (pago.riel === "lightning") {
    const esperada = tasaCentavosPorBtc(raw.totalCentavos, pago.sats);
    if (esperada !== pago.tasaUsdPorBtc) {
      throw new ErrorLedger(
        `La tasa ${pago.tasaUsdPorBtc} no cuadra con ${formatoUsd(raw.totalCentavos)} y ${formatoSats(pago.sats)}: esos montos dan ${esperada}.`,
      );
    }
  }
  return { numero: raw.numero, pagadaEn: new Date(raw.pagadaEn).toISOString(), lineas, totalCentavos: raw.totalCentavos, pago };
}

// The ticket payment for this order. The amount is the order total: a partial payment is refused.
export function pagoDeOrden(orden: OrdenMarket): Pago {
  if (orden.pago.riel === "efectivo") {
    return { rail: "efectivo", montoCentavos: orden.totalCentavos, momento: orden.pagadaEn };
  }
  return {
    rail: "lightning",
    montoCentavos: orden.totalCentavos,
    momento: orden.pagadaEn,
    sats: orden.pago.sats,
    tasaUsdPorBtc: orden.pago.tasaUsdPorBtc,
    tasaFuente: orden.pago.tasaFuente,
    paymentHash: orden.pago.paymentHash,
    idTransaccion: `cacaomarket-${orden.numero}`,
  };
}

function firmaContenido(lineas: LineaTicket[], total: number): string {
  return canonico({ lineas: lineas.map((l) => ({ c: l.cantidad, d: l.descripcion, p: l.precioCentavos })), total });
}

// Creates the paid ticket for an order. Importing the same order again writes nothing new.
export function importarOrdenMarket(datos: string, raw: unknown, ahora: Date): ResultadoImportacion {
  const orden = leerOrdenMarket(raw);
  const previo = ticketDeOrigen(datos, "cacaomarket", orden.numero);
  if (previo) {
    const total = previo.pago?.montoCentavos ?? -1;
    if (firmaContenido(previo.lineas, total) !== firmaContenido(orden.lineas, orden.totalCentavos)) {
      throw new ErrorLedger(`El pedido ${orden.numero} ya está importado como ${previo.id} con otro contenido; no se importa de nuevo.`);
    }
    return { ticket: previo, nueva: false };
  }
  const pago = pagoDeOrden(orden);
  if (pago.rail === "lightning") {
    const otro = ticketConHashDePago(datos, pago.paymentHash, "");
    if (otro) throw new ErrorLedger(`Ese pago de Lightning ya cubre el ticket ${otro}; no se puede usar dos veces.`);
  }
  const entrada = validarEntrada({ cliente: "consumidor", lineas: orden.lineas });
  const abierto = crearTicket(entrada, ahora);
  const pagado = registrarPago(abierto, pago, ahora);
  const ticket: Ticket = { ...pagado, origen: { plataforma: "cacaomarket", numero: orden.numero } };
  guardarTicket(datos, ticket);
  return { ticket, nueva: true };
}

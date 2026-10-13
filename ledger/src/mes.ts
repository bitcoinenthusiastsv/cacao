import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { leerJson } from "./datos.ts";
import { ErrorLedger } from "./errores.ts";
import { formatoUsd } from "./dinero.ts";
import { fechaHoraSalvador } from "./tiempo.ts";
import type { Ticket } from "./ticket.ts";

// Month-end figures, generated from the tickets and the documents they hold. Only documents
// with a seal count. The books record the document as it was emitted; the figures feed the
// monthly returns and are an aid for the accountant, not a filed return.

const NOTA_CIFRAS =
  "Estas cifras salen solo de los tickets de CacaoLedger: no incluyen compras, retenciones ni otros ingresos, " +
  "y son una ayuda para el contador, no una declaración presentada.";

// Pago a cuenta of F-14: 1.75 % of gross income. 175 ten-thousandths of the base.
const PAGO_A_CUENTA_DIEZMILESIMAS = 175;

export interface DocumentoMes {
  tipoDte: "01" | "03";
  fecha: string; // YYYY-MM-DD, date of emission in El Salvador
  numeroControl: string;
  codigoGeneracion: string;
  ticket: string;
  receptorNombre: string | null;
  receptorNrc: string | null;
  netoCentavos: number; // taxable sales without IVA
  ivaCentavos: number;
  totalCentavos: number; // 01: IVA included, as recorded; 03: net plus IVA
}

export interface NoIncluido {
  ticket: string;
  cliente: string;
  estado: string;
  fecha: string;
  motivo: string;
}

export interface FilaConsumidor {
  fecha: string;
  primerControl: string | null;
  ultimoControl: string | null;
  cantidad: number;
  ventasGravadasCentavos: number;
}

export interface FilaContribuyente {
  fecha: string;
  numeroControl: string;
  codigoGeneracion: string;
  receptorNombre: string;
  receptorNrc: string;
  netoCentavos: number;
  ivaCentavos: number;
  totalCentavos: number;
}

export interface Cifras {
  f07BaseGravadaCentavos: number;
  f07DebitoIvaCentavos: number;
  f14IngresosBrutosCentavos: number;
  f14PagoACuentaCentavos: number;
}

export interface InformeMes {
  mes: string;
  consumidor: { filas: FilaConsumidor[]; cantidad: number; ventasGravadasCentavos: number };
  contribuyentes: { filas: FilaContribuyente[]; cantidad: number; netoCentavos: number; ivaCentavos: number; totalCentavos: number };
  cifras: Cifras;
  noIncluidos: NoIncluido[];
  nota: string;
}

// Half up to the cent: floor((base * 175 + 5000) / 10000) is base * 1.75 % rounded.
export function pagoACuentaCentavos(baseCentavos: number): number {
  return Math.floor((baseCentavos * PAGO_A_CUENTA_DIEZMILESIMAS + 5000) / 10000);
}

export function validarMes(texto: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(texto)) {
    throw new ErrorLedger(`El mes "${texto}" no tiene la forma YYYY-MM (por ejemplo 2026-10).`);
  }
  return texto;
}

function dolaresACentavos(v: unknown, campo: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ErrorLedger(`El documento no trae un monto válido en ${campo}.`);
  return Math.round(v * 100);
}

// Reads the figures a book needs from a stored document. Amounts are cents from here on.
export function documentoDesde(doc: unknown, ticket: string): DocumentoMes {
  const d = doc as Record<string, any>;
  const ident = d.identificacion ?? {};
  const resumen = d.resumen ?? {};
  const tipo = ident.tipoDte;
  if (tipo !== "01" && tipo !== "03") throw new ErrorLedger(`El documento del ticket ${ticket} no es 01 ni 03.`);
  const fecha = String(ident.fecEmi ?? "");
  if (tipo === "01") {
    const iva = dolaresACentavos(resumen.totalIva, "resumen.totalIva");
    const gravadoIvaIncluido = dolaresACentavos(resumen.totalGravada, "resumen.totalGravada");
    return {
      tipoDte: "01",
      fecha,
      numeroControl: String(ident.numeroControl),
      codigoGeneracion: String(ident.codigoGeneracion),
      ticket,
      receptorNombre: null,
      receptorNrc: null,
      netoCentavos: gravadoIvaIncluido - iva,
      ivaCentavos: iva,
      totalCentavos: gravadoIvaIncluido,
    };
  }
  const neto = dolaresACentavos(resumen.totalGravada, "resumen.totalGravada");
  const iva = dolaresACentavos(resumen.tributos?.[0]?.valor, "resumen.tributos[0].valor");
  const total = dolaresACentavos(resumen.montoTotalOperacion, "resumen.montoTotalOperacion");
  return {
    tipoDte: "03",
    fecha,
    numeroControl: String(ident.numeroControl),
    codigoGeneracion: String(ident.codigoGeneracion),
    ticket,
    receptorNombre: String(d.receptor?.nombre ?? ""),
    receptorNrc: String(d.receptor?.nrc ?? ""),
    netoCentavos: neto,
    ivaCentavos: iva,
    totalCentavos: total,
  };
}

// Reads the stored document of every emitted ticket. A missing file is an error, not a skip:
// a sealed sale without its document would otherwise vanish from the books.
export function leerDocumentosEmitidos(datos: string, tickets: Ticket[]): DocumentoMes[] {
  const documentos: DocumentoMes[] = [];
  for (const t of tickets) {
    if (t.estado !== "emitido" || !t.dte) continue;
    let doc: unknown;
    try {
      doc = leerJson(join(datos, t.dte.archivo));
    } catch {
      throw new ErrorLedger(`No se puede leer el documento del ticket ${t.id} (${t.dte.archivo}).`);
    }
    documentos.push(documentoDesde(doc, t.id));
  }
  return documentos;
}

function diasDelMes(mes: string): string[] {
  const [anio, m] = mes.split("-").map(Number) as [number, number];
  const cuantos = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const dias: string[] = [];
  for (let d = 1; d <= cuantos; d++) dias.push(`${mes}-${String(d).padStart(2, "0")}`);
  return dias;
}

// Ordinal of a control number inside its series: the 15 digits at the end.
function correlativo(numeroControl: string): number {
  return Number(numeroControl.slice(-15));
}

// Tickets that hold money but no valid document, for the month of their payment (or creation).
function noIncluidosDelMes(mes: string, tickets: Ticket[]): NoIncluido[] {
  const salida: NoIncluido[] = [];
  for (const t of tickets) {
    if (t.estado === "emitido" || t.estado === "abierto") continue;
    const momento = t.pago?.momento ?? t.creado;
    const fecha = fechaHoraSalvador(new Date(momento)).fecEmi;
    if (fecha.slice(0, 7) !== mes) continue;
    let motivo: string;
    if (t.estado === "rechazado") {
      motivo = `rechazado por la recepción: ${t.rechazo?.observaciones[0] ?? "sin motivo"}`;
    } else if (t.dte) {
      motivo = "documento construido, sin transmitir";
    } else {
      motivo = "pagado y sin documento: nunca se construyó";
    }
    salida.push({ ticket: t.id, cliente: t.cliente, estado: t.estado, fecha, motivo });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ticket.localeCompare(b.ticket));
}

// Pure: the books and figures of one month from the documents and tickets given.
export function informeMes(mes: string, documentos: DocumentoMes[], tickets: Ticket[]): InformeMes {
  validarMes(mes);
  const delMes = documentos.filter((d) => d.fecha.slice(0, 7) === mes);
  const porDia = new Map<string, DocumentoMes[]>();
  for (const d of delMes) {
    const lista = porDia.get(d.fecha) ?? [];
    lista.push(d);
    porDia.set(d.fecha, lista);
  }

  // One row per day of the month, including days without sales.
  const filas: FilaConsumidor[] = diasDelMes(mes).map((dia) => {
    const docs = (porDia.get(dia) ?? []).filter((d) => d.tipoDte === "01").sort((a, b) => correlativo(a.numeroControl) - correlativo(b.numeroControl));
    const primero = docs[0];
    const ultimo = docs[docs.length - 1];
    return {
      fecha: dia,
      primerControl: primero?.numeroControl ?? null,
      ultimoControl: ultimo?.numeroControl ?? null,
      cantidad: docs.length,
      ventasGravadasCentavos: docs.reduce((acc, d) => acc + d.totalCentavos, 0),
    };
  });

  const docs01 = delMes.filter((d) => d.tipoDte === "01");
  const docs03 = delMes
    .filter((d) => d.tipoDte === "03")
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || correlativo(a.numeroControl) - correlativo(b.numeroControl));
  const contribuyentes: FilaContribuyente[] = docs03.map((d) => ({
    fecha: d.fecha,
    numeroControl: d.numeroControl,
    codigoGeneracion: d.codigoGeneracion,
    receptorNombre: d.receptorNombre ?? "",
    receptorNrc: d.receptorNrc ?? "",
    netoCentavos: d.netoCentavos,
    ivaCentavos: d.ivaCentavos,
    totalCentavos: d.totalCentavos,
  }));

  const sumar = (docs: DocumentoMes[], f: (d: DocumentoMes) => number) => docs.reduce((acc, d) => acc + f(d), 0);
  const baseGravada = sumar(delMes, (d) => d.netoCentavos);
  const debitoIva = sumar(delMes, (d) => d.ivaCentavos);
  const pagoACuenta = pagoACuentaCentavos(baseGravada);

  return {
    mes,
    consumidor: {
      filas,
      cantidad: docs01.length,
      ventasGravadasCentavos: sumar(docs01, (d) => d.totalCentavos),
    },
    contribuyentes: {
      filas: contribuyentes,
      cantidad: docs03.length,
      netoCentavos: sumar(docs03, (d) => d.netoCentavos),
      ivaCentavos: sumar(docs03, (d) => d.ivaCentavos),
      totalCentavos: sumar(docs03, (d) => d.totalCentavos),
    },
    cifras: {
      f07BaseGravadaCentavos: baseGravada,
      f07DebitoIvaCentavos: debitoIva,
      f14IngresosBrutosCentavos: baseGravada,
      f14PagoACuentaCentavos: pagoACuenta,
    },
    noIncluidos: noIncluidosDelMes(mes, tickets),
    nota: NOTA_CIFRAS,
  };
}

// Display helpers. Day in DD/MM/YYYY, the form used in El Salvador.
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function cifraCsv(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function celdaCsv(v: string | number | null): string {
  const texto = v === null ? "" : String(v);
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const BOM = "﻿";

function csv(encabezados: string[], filas: (string | number | null)[][]): string {
  const lineas = [encabezados, ...filas].map((f) => f.map(celdaCsv).join(";"));
  return `${BOM}${lineas.join("\r\n")}\r\n`;
}

// Semicolon-separated, UTF-8 with BOM, decimal comma. A Salvadoran spreadsheet opens it as is.
export function libroConsumidorCsv(informe: InformeMes): string {
  const filas: (string | number | null)[][] = informe.consumidor.filas.map((f) => [
    fechaCorta(f.fecha),
    f.primerControl,
    f.ultimoControl,
    f.cantidad,
    cifraCsv(f.ventasGravadasCentavos),
  ]);
  filas.push(["Total del mes", null, null, informe.consumidor.cantidad, cifraCsv(informe.consumidor.ventasGravadasCentavos)]);
  return csv(["Fecha", "Primer número de control", "Último número de control", "Cantidad de documentos", "Ventas gravadas (IVA incluido)"], filas);
}

export function libroContribuyentesCsv(informe: InformeMes): string {
  const c = informe.contribuyentes;
  const filas: (string | number | null)[][] = c.filas.map((f) => [
    fechaCorta(f.fecha),
    f.numeroControl,
    f.codigoGeneracion,
    f.receptorNombre,
    f.receptorNrc,
    cifraCsv(f.netoCentavos),
    cifraCsv(f.ivaCentavos),
    cifraCsv(f.totalCentavos),
  ]);
  filas.push(["Total del mes", null, null, null, null, cifraCsv(c.netoCentavos), cifraCsv(c.ivaCentavos), cifraCsv(c.totalCentavos)]);
  return csv(
    ["Fecha", "Número de control", "Código de generación", "Nombre del receptor", "NRC del receptor", "Venta gravada neta", "IVA", "Total"],
    filas,
  );
}

export function nombresLibros(mes: string): { consumidor: string; contribuyentes: string } {
  return {
    consumidor: `libro-consumidor-final-01_${mes}.csv`,
    contribuyentes: `libro-contribuyentes-03_${mes}.csv`,
  };
}

export function escribirLibrosCsv(carpeta: string, informe: InformeMes): string[] {
  mkdirSync(carpeta, { recursive: true });
  const nombres = nombresLibros(informe.mes);
  const rutas = [join(carpeta, nombres.consumidor), join(carpeta, nombres.contribuyentes)];
  writeFileSync(rutas[0] as string, libroConsumidorCsv(informe), "utf8");
  writeFileSync(rutas[1] as string, libroContribuyentesCsv(informe), "utf8");
  return rutas;
}

function tabla(encabezados: string[], filas: string[][], alineacion: ("izq" | "der")[]): string[] {
  const todas = [encabezados, ...filas];
  const anchos = encabezados.map((_, i) => Math.max(...todas.map((f) => (f[i] ?? "").length)));
  const linea = (f: string[]) =>
    f
      .map((celda, i) => (alineacion[i] === "der" ? celda.padStart(anchos[i] ?? 0) : celda.padEnd(anchos[i] ?? 0)))
      .join("  ")
      .trimEnd();
  return [linea(encabezados), ...filas.map(linea)];
}

function plural(n: number): string {
  return `${n} ${n === 1 ? "documento" : "documentos"}`;
}

// Terminal view of the month: the two books, the figures with the form they feed, and what was left out.
export function lineasMes(informe: InformeMes): string[] {
  const lineas: string[] = [`Libros de IVA · ${informe.mes} (hora de El Salvador)`, ""];
  lineas.push("Libro de ventas a consumidor final (documentos 01)");
  const filasC = informe.consumidor.filas.map((f) => [
    fechaCorta(f.fecha),
    f.primerControl ?? "sin ventas",
    f.ultimoControl ?? "",
    String(f.cantidad),
    f.cantidad > 0 ? formatoUsd(f.ventasGravadasCentavos) : "",
  ]);
  lineas.push(...tabla(["Fecha", "Primer control", "Último control", "Docs", "Ventas gravadas (IVA incl.)"], filasC, ["izq", "izq", "izq", "der", "der"]));
  lineas.push(`Total del mes: ${plural(informe.consumidor.cantidad)}, ${formatoUsd(informe.consumidor.ventasGravadasCentavos)}`);
  lineas.push("");

  lineas.push("Libro de ventas a contribuyentes (documentos 03)");
  if (informe.contribuyentes.filas.length === 0) {
    lineas.push("  No hay comprobantes de crédito fiscal emitidos este mes.");
  } else {
    const filasK = informe.contribuyentes.filas.map((f) => [
      fechaCorta(f.fecha),
      f.numeroControl,
      f.codigoGeneracion,
      f.receptorNombre,
      f.receptorNrc,
      formatoUsd(f.netoCentavos),
      formatoUsd(f.ivaCentavos),
      formatoUsd(f.totalCentavos),
    ]);
    lineas.push(
      ...tabla(
        ["Fecha", "Número de control", "Código de generación", "Receptor", "NRC", "Neto", "IVA", "Total"],
        filasK,
        ["izq", "izq", "izq", "izq", "izq", "der", "der", "der"],
      ),
    );
  }
  lineas.push(
    `Total del mes: ${plural(informe.contribuyentes.cantidad)}, neto ${formatoUsd(informe.contribuyentes.netoCentavos)}, ` +
      `IVA ${formatoUsd(informe.contribuyentes.ivaCentavos)}, total ${formatoUsd(informe.contribuyentes.totalCentavos)}`,
  );
  lineas.push("");

  const c = informe.cifras;
  lineas.push("Cifras para las declaraciones");
  lineas.push(
    ...tabla(
      ["Cifra", "Monto", "Formulario"],
      [
        ["Base gravada del mes, sin IVA", formatoUsd(c.f07BaseGravadaCentavos), "F-07, ventas gravadas"],
        ["Débito fiscal de IVA del mes", formatoUsd(c.f07DebitoIvaCentavos), "F-07, IVA a pagar"],
        ["Ingresos brutos del mes, sin IVA", formatoUsd(c.f14IngresosBrutosCentavos), "F-14, base del pago a cuenta"],
        ["Pago a cuenta de 1.75 %", formatoUsd(c.f14PagoACuentaCentavos), "F-14, pago a cuenta"],
      ],
      ["izq", "der", "izq"],
    ),
  );
  lineas.push(informe.nota);
  lineas.push("");

  lineas.push("No incluidos: no tienen documento válido con sello");
  if (informe.noIncluidos.length === 0) {
    lineas.push("  Ninguno este mes.");
  } else {
    for (const n of informe.noIncluidos) {
      lineas.push(`  ${n.ticket}  ${fechaCorta(n.fecha)}  ${n.cliente}  ${n.estado}  ${n.motivo}`);
    }
  }
  return lineas;
}

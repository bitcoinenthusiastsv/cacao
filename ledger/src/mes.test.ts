import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emisorPrueba, entradaConsumidor, entradaContribuyente } from "./ayudas-prueba.ts";
import { construirDte } from "./dte/construir.ts";
import { pagoEfectivo } from "./pagos/efectivo.ts";
import {
  anexoConsumidorF07Csv,
  anexoContribuyentesF07Csv,
  documentoDesde,
  informeMes,
  leerDocumentosEmitidos,
  libroConsumidorCsv,
  libroContribuyentesCsv,
  lineasMes,
  pagoACuentaCentavos,
  validarMes,
  type DocumentoMes,
} from "./mes.ts";
import { adjuntarDte, aceptarDte, crearTicket, registrarPago, rechazarDte, totalDeTicket, validarEntrada, type EntradaTicket, type Ticket } from "./ticket.ts";

const MES = "2026-10";

// A ticket paid in cash on one day, with its document built and, when asked, sealed.
function venta(
  entrada: EntradaTicket,
  id: string,
  dia: string,
  opciones: { tipo: "01" | "03"; estado: "emitido" | "rechazado" | "huerfano" | "abierto"; correlativo: number },
): { ticket: Ticket; documento?: Record<string, unknown> } {
  const abierto = crearTicket(entrada, new Date(`${dia}T15:00:00Z`), id);
  if (opciones.estado === "abierto") return { ticket: abierto };
  const pagado = registrarPago(abierto, pagoEfectivo(totalDeTicket(abierto).totalCentavos, new Date(`${dia}T15:01:00Z`)), new Date(`${dia}T15:01:00Z`));
  if (opciones.estado === "huerfano") return { ticket: pagado };
  const construido = construirDte(opciones.tipo, pagado, pagado.pago!, emisorPrueba("2026"), {
    correlativo: opciones.correlativo,
    ahora: new Date(`${dia}T15:02:00Z`),
    codigoGeneracion: `00000000-0000-4000-8000-${String(opciones.correlativo).padStart(12, "0")}`,
    generacion: "2026",
  });
  const ref = {
    tipoDte: opciones.tipo,
    codigoGeneracion: construido.codigoGeneracion,
    numeroControl: construido.numeroControl,
    ambiente: "00" as const,
    archivo: `dte/${id}.json`,
  };
  const conDte = adjuntarDte(pagado, ref, new Date(`${dia}T15:02:00Z`));
  if (opciones.estado === "rechazado") {
    return { ticket: rechazarDte(conDte, ["resumen.totalIva: no cuadra"], new Date(`${dia}T15:03:00Z`)), documento: construido.documento };
  }
  const emitido = aceptarDte(conDte, { valor: `SIMULADO-${"A".repeat(34)}`, momento: `${dia}T15:03:00.000Z`, simulado: true }, new Date(`${dia}T15:03:00Z`));
  return { ticket: emitido, documento: construido.documento };
}

// The month used by most tests: two 01 on the 5th, one 01 and one 03 on the 7th,
// a rejected 01 and a paid orphan on the 6th, and an open ticket that is not a sale.
function mesDePrueba() {
  const piezas = [
    venta(entradaConsumidor(), "TK-20261005-0001", "2026-10-05", { tipo: "01", estado: "emitido", correlativo: 1 }),
    venta(entradaConsumidor(), "TK-20261005-0002", "2026-10-05", { tipo: "01", estado: "emitido", correlativo: 2 }),
    venta(entradaConsumidor(), "TK-20261007-0003", "2026-10-07", { tipo: "01", estado: "emitido", correlativo: 3 }),
    venta(entradaContribuyente("2026"), "TK-20261007-0004", "2026-10-07", { tipo: "03", estado: "emitido", correlativo: 1 }),
    venta(entradaConsumidor(), "TK-20261006-0005", "2026-10-06", { tipo: "01", estado: "rechazado", correlativo: 4 }),
    venta(entradaConsumidor(), "TK-20261006-0006", "2026-10-06", { tipo: "01", estado: "huerfano", correlativo: 0 }),
    venta(entradaConsumidor(), "TK-20261006-0007", "2026-10-06", { tipo: "01", estado: "abierto", correlativo: 0 }),
  ];
  const tickets = piezas.map((p) => p.ticket);
  const documentos: DocumentoMes[] = piezas
    .filter((p) => p.ticket.estado === "emitido" && p.documento)
    .map((p) => documentoDesde(p.documento, p.ticket.id));
  return { tickets, documentos, informe: informeMes(MES, documentos, tickets) };
}

test("the month holds the sealed documents only, with the figures of the fixed days", () => {
  const { informe } = mesDePrueba();
  // Consumer book: 31 rows, one per day of October, the 5th with two documents, the 6th empty.
  assert.equal(informe.consumidor.filas.length, 31);
  const dia5 = informe.consumidor.filas.find((f) => f.fecha === "2026-10-05");
  assert.equal(dia5?.cantidad, 2);
  assert.equal(dia5?.primerControl, "DTE-01-M001P001-000000000000001");
  assert.equal(dia5?.ultimoControl, "DTE-01-M001P001-000000000000002");
  assert.equal(dia5?.ventasGravadasCentavos, 904, "two sales of $4.52, IVA included");
  const dia6 = informe.consumidor.filas.find((f) => f.fecha === "2026-10-06");
  assert.equal(dia6?.cantidad, 0, "a day without sales keeps its row");
  assert.equal(dia6?.primerControl, null);
  assert.equal(informe.consumidor.cantidad, 3);
  assert.equal(informe.consumidor.ventasGravadasCentavos, 1356);

  assert.equal(informe.contribuyentes.filas.length, 1);
  assert.equal(informe.contribuyentes.filas[0]?.netoCentavos, 400);
  assert.equal(informe.contribuyentes.filas[0]?.ivaCentavos, 52);
  assert.equal(informe.contribuyentes.filas[0]?.totalCentavos, 452);
  assert.equal(informe.contribuyentes.filas[0]?.receptorNombre, "Distribuidora Ejemplo, S.A. de C.V.");
});

test("the figures for F-07 and F-14 come from the documents and state their form", () => {
  const { informe } = mesDePrueba();
  // Net base: three 01 at $4.00 and one 03 at $4.00. IVA: four at $0.52.
  assert.equal(informe.cifras.f07BaseGravadaCentavos, 1600);
  assert.equal(informe.cifras.f07DebitoIvaCentavos, 208);
  assert.equal(informe.cifras.f14IngresosBrutosCentavos, 1600);
  assert.equal(informe.cifras.f14PagoACuentaCentavos, 28, "1.75 % of $16.00 is $0.28");
  const texto = lineasMes(informe).join("\n");
  assert.match(texto, /F-07, ventas gravadas/);
  assert.match(texto, /F-14, pago a cuenta/);
  assert.match(texto, /no incluyen compras, retenciones ni otros ingresos/);
});

test("rejected and orphan tickets are listed under No incluidos with the reason; open tickets are not sales", () => {
  const { informe } = mesDePrueba();
  const ids = informe.noIncluidos.map((n) => n.ticket);
  assert.deepEqual(ids, ["TK-20261006-0005", "TK-20261006-0006"]);
  assert.match(informe.noIncluidos[0]?.motivo ?? "", /^rechazado por la recepción: resumen\.totalIva: no cuadra/);
  assert.equal(informe.noIncluidos[1]?.motivo, "pagado y sin documento: nunca se construyó");
  assert.ok(!ids.includes("TK-20261006-0007"), "an open ticket is not money received");
});

test("the books add up to the sum of the documents, cent for cent, with odd prices", () => {
  const entradas = [
    validarEntrada({ cliente: "consumidor", lineas: [{ descripcion: "Pan", cantidad: 1, precioCentavos: 37 }] }),
    validarEntrada({ cliente: "consumidor", lineas: [{ descripcion: "Queso", cantidad: 3, precioCentavos: 101 }] }),
    validarEntrada({ cliente: "consumidor", lineas: [{ descripcion: "Café", cantidad: 1, precioCentavos: 263 }, { descripcion: "Miel", cantidad: 2, precioCentavos: 55 }] }),
  ];
  const piezas = entradas.map((e, i) => venta(e, `TK-20261012-00${i + 10}`, "2026-10-12", { tipo: "01", estado: "emitido", correlativo: 10 + i }));
  const tickets = piezas.map((p) => p.ticket);
  const docs = piezas.map((p) => p.documento as Record<string, any>);
  const documentos = piezas.map((p) => documentoDesde(p.documento, p.ticket.id));
  const informe = informeMes("2026-10", documentos, tickets);

  const sumaTotales = docs.reduce((a, d) => a + Math.round(Number(d.resumen.totalGravada) * 100), 0);
  const sumaIva = docs.reduce((a, d) => a + Math.round(Number(d.resumen.totalIva) * 100), 0);
  assert.equal(informe.consumidor.ventasGravadasCentavos, sumaTotales);
  assert.equal(informe.cifras.f07DebitoIvaCentavos, sumaIva);
  assert.equal(informe.cifras.f07BaseGravadaCentavos, sumaTotales - sumaIva);
  const diaFila = informe.consumidor.filas.find((f) => f.fecha === "2026-10-12");
  assert.equal(diaFila?.ventasGravadasCentavos, sumaTotales, "the day row equals the documents of the day");
});

test("pago a cuenta is 1.75 % rounded half up to the cent", () => {
  assert.equal(pagoACuentaCentavos(0), 0);
  assert.equal(pagoACuentaCentavos(1000), 18, "17.5 cents rounds up to 18");
  assert.equal(pagoACuentaCentavos(123456), 2160, "1,234.56 at 1.75 % is 21.60");
  assert.equal(pagoACuentaCentavos(1600), 28);
});

test("the CSV books open in a spreadsheet: BOM, semicolons, decimal comma, a total row", () => {
  const { informe } = mesDePrueba();
  const consumidor = libroConsumidorCsv(informe);
  assert.ok(consumidor.startsWith("\uFEFF"), "UTF-8 with BOM");
  // trim() would also strip the BOM, so the lines are read after it.
  const lineas = consumidor.slice(1).replace(/\r\n$/, "").split("\r\n");
  assert.equal(lineas[0], "Fecha;Primer número de control;Último número de control;Cantidad de documentos;Ventas gravadas (IVA incluido)");
  assert.ok(lineas.includes("05/10/2026;DTE-01-M001P001-000000000000001;DTE-01-M001P001-000000000000002;2;9,04"));
  assert.equal(lineas[lineas.length - 1], "Total del mes;;;3;13,56");

  const contribuyentes = libroContribuyentesCsv(informe);
  const filaK = contribuyentes.split("\r\n").find((l) => l.startsWith("07/10/2026;DTE-03"));
  assert.ok(filaK, "one row per 03 document");
  assert.match(filaK, /;4,00;0,52;4,52$/);
  assert.match(filaK, /Distribuidora Ejemplo, S\.A\. de C\.V\./, "a comma inside a name stays inside its cell");
});

test("a month is written as YYYY-MM and nothing else", () => {
  assert.equal(validarMes("2026-10"), "2026-10");
  assert.throws(() => validarMes("2026-13"), /no tiene la forma YYYY-MM/);
  assert.throws(() => validarMes("26-10"), /no tiene la forma YYYY-MM/);
});

test("a sealed sale whose document file is missing stops the books instead of disappearing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-mes-"));
  try {
    const { ticket } = venta(entradaConsumidor(), "TK-20261005-0100", "2026-10-05", { tipo: "01", estado: "emitido", correlativo: 100 });
    assert.throws(() => leerDocumentosEmitidos(dir, [ticket]), /No se puede leer el documento del ticket TK-20261005-0100/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("DGII 2021 template annexes have 20 columns (Anexo 1) and 23 columns (Anexo 2) with Renta fields", () => {
  const { informe } = mesDePrueba();
  const a1 = anexoContribuyentesF07Csv(informe).trim().split("\r\n");
  assert.equal(a1.length, 1);
  const cols1 = (a1[0] ?? "").split(";");
  assert.equal(cols1.length, 20, "Anexo 1 has 20 columns A-T");
  assert.equal(cols1[0], "07/10/2026");
  assert.equal(cols1[1], "4");
  assert.equal(cols1[2], "03");
  assert.equal(cols1[11], "4.00");
  assert.equal(cols1[12], "0.52");
  assert.equal(cols1[15], "4.52");
  assert.equal(cols1[17], "1");
  assert.equal(cols1[18], "3");
  assert.equal(cols1[19], "1");

  const a2 = anexoConsumidorF07Csv(informe).trim().split("\r\n");
  assert.equal(a2.length, 2, "two days with emitted 01 sales (Oct 5 and Oct 7)");
  const cols2 = (a2[0] ?? "").split(";");
  assert.equal(cols2.length, 23, "Anexo 2 has 23 columns A-W");
  assert.equal(cols2[0], "05/10/2026");
  assert.equal(cols2[1], "4");
  assert.equal(cols2[2], "01");
  assert.equal(cols2[13], "9.04");
  assert.equal(cols2[19], "9.04");
  assert.equal(cols2[20], "1");
  assert.equal(cols2[21], "3");
  assert.equal(cols2[22], "2");
});


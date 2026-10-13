import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularTotales,
  centavosDesdeTexto,
  enLetrasUsd,
  formatoUsd,
  ivaIncluido,
  ivaSobreNeto,
  montoDte,
  type LineaPrecio,
} from "./dinero.ts";

test("IVA contained in a consumer price is price * 13 / 113, rounded to the cent", () => {
  assert.equal(ivaIncluido(113), 13); // $1.13 holds $0.13
  assert.equal(ivaIncluido(452), 52); // $4.52 holds $0.52 exactly
  assert.equal(ivaIncluido(99), 11); // $0.99 -> 11.39 cents -> 11
  assert.equal(ivaIncluido(1), 0);
  assert.equal(ivaIncluido(0), 0);
});

test("IVA on a business price is 13 % added, rounded half up", () => {
  assert.equal(ivaSobreNeto(100), 13); // $1.00 -> $0.13
  assert.equal(ivaSobreNeto(50), 7); // 6.5 cents -> 7
  assert.equal(ivaSobreNeto(1), 0);
  assert.equal(ivaSobreNeto(297), 39); // 38.61 -> 39
});

test("consumer totals: $0.99 x 3 keeps IVA inside the price", () => {
  const { totales, lineas } = calcularTotales([{ descripcion: "Pupusa", cantidad: 3, precioCentavos: 99 }], "con-iva");
  assert.equal(lineas[0]?.ventaCentavos, 297);
  assert.equal(lineas[0]?.ivaCentavos, 34);
  assert.equal(lineas[0]?.netoCentavos, 263);
  assert.equal(totales.gravadoCentavos, 297);
  assert.equal(totales.ivaCentavos, 34);
  assert.equal(totales.totalCentavos, 297);
  assert.equal(totales.netoCentavos, 263);
});

test("consumer totals: mixed lines $1.13, $0.99 x 3 and $9.99 x 3 agree with the lines", () => {
  const lineas: LineaPrecio[] = [
    { descripcion: "Café", cantidad: 1, precioCentavos: 113 },
    { descripcion: "Pupusa", cantidad: 3, precioCentavos: 99 },
    { descripcion: "Pan", cantidad: 3, precioCentavos: 999 },
  ];
  const { totales, lineas: calc } = calcularTotales(lineas, "con-iva");
  const sumaTotal = calc.reduce((a, l) => a + l.totalCentavos, 0);
  const sumaIva = calc.reduce((a, l) => a + l.ivaCentavos, 0);
  assert.equal(totales.totalCentavos, sumaTotal);
  assert.equal(totales.ivaCentavos, sumaIva);
  assert.equal(totales.gravadoCentavos, totales.totalCentavos);
  assert.equal(totales.netoCentavos + totales.ivaCentavos, totales.totalCentavos);
  assert.equal(totales.totalCentavos, 113 + 297 + 2997);
  assert.equal(sumaIva, 13 + 34 + 345);
});

test("business totals: $0.99 x 3 and $9.99 x 3 add IVA on top", () => {
  const { totales } = calcularTotales(
    [
      { descripcion: "Clavo", cantidad: 3, precioCentavos: 99 },
      { descripcion: "Martillo", cantidad: 3, precioCentavos: 999 },
    ],
    "sin-iva",
  );
  assert.equal(totales.gravadoCentavos, 297 + 2997);
  assert.equal(totales.ivaCentavos, 39 + 390);
  assert.equal(totales.totalCentavos, 3294 + 429);
  assert.equal(totales.totalCentavos, totales.gravadoCentavos + totales.ivaCentavos);
});

test("a $1.13 consumer price and a $1.00 business price give the same total when prices divide exactly", () => {
  const consumidor = calcularTotales([{ descripcion: "Café", cantidad: 2, precioCentavos: 113 }], "con-iva").totales;
  const contribuyente = calcularTotales([{ descripcion: "Café", cantidad: 2, precioCentavos: 100 }], "sin-iva").totales;
  assert.equal(consumidor.totalCentavos, 226);
  assert.equal(contribuyente.totalCentavos, 226);
  assert.equal(consumidor.ivaCentavos, contribuyente.ivaCentavos);
});

test("quantities and prices must be non-negative integers in cents", () => {
  assert.throws(() => calcularTotales([{ descripcion: "x", cantidad: 0, precioCentavos: 1 }], "con-iva"), RangeError);
  assert.throws(() => calcularTotales([{ descripcion: "x", cantidad: 1, precioCentavos: 1.5 }], "con-iva"), RangeError);
  assert.throws(() => calcularTotales([{ descripcion: "x", cantidad: 1, precioCentavos: -1 }], "sin-iva"), RangeError);
});

test("centavosDesdeTexto parses plain dollar amounts and rejects the rest", () => {
  assert.equal(centavosDesdeTexto("3.50"), 350);
  assert.equal(centavosDesdeTexto("0.5"), 50);
  assert.equal(centavosDesdeTexto("12"), 1200);
  assert.equal(centavosDesdeTexto("0.99"), 99);
  assert.throws(() => centavosDesdeTexto("1.234"), /no es un monto válido/);
  assert.throws(() => centavosDesdeTexto("-1"), /no es un monto válido/);
  assert.throws(() => centavosDesdeTexto("abc"), /no es un monto válido/);
});

test("montoDte gives a number with two decimals and no float noise", () => {
  assert.equal(montoDte(29), 0.29);
  assert.equal(montoDte(297), 2.97);
  assert.equal(montoDte(100000), 1000);
});

test("formatoUsd shows dollars with thousands separators", () => {
  assert.equal(formatoUsd(5), "$0.05");
  assert.equal(formatoUsd(452), "$4.52");
  assert.equal(formatoUsd(123456), "$1,234.56");
});

test("enLetrasUsd writes the amount in Spanish for totalLetras", () => {
  assert.equal(enLetrasUsd(410), "CUATRO 10/100 USD");
  assert.equal(enLetrasUsd(2100), "VEINTIUNO 00/100 USD");
  assert.equal(enLetrasUsd(100000), "MIL 00/100 USD");
  assert.equal(enLetrasUsd(123456), "MIL DOSCIENTOS TREINTA Y CUATRO 56/100 USD");
  assert.equal(enLetrasUsd(100000000), "UN MILLON 00/100 USD");
  assert.equal(enLetrasUsd(0), "CERO 00/100 USD");
});

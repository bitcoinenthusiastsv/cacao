// Catalogues the tool uses, copied from the Ministry workbook
// "Catálogos - Facturación Electrónica" (download 5353 on factura.gob.sv, sheet
// "Hoja1"). Only the entries used by this tool are listed here.

export interface EntradaCatalogo {
  codigo: string;
  valor: string;
}

// CAT-017 Forma de pago, all twelve entries.
export const CAT_017: readonly EntradaCatalogo[] = [
  { codigo: "01", valor: "Billetes y monedas" },
  { codigo: "02", valor: "Tarjeta Débito" },
  { codigo: "03", valor: "Tarjeta Crédito" },
  { codigo: "04", valor: "Cheque" },
  { codigo: "05", valor: "Transferencia-Depósito Bancario" },
  { codigo: "08", valor: "Dinero electrónico" },
  { codigo: "09", valor: "Monedero electrónico" },
  { codigo: "11", valor: "Bitcoin" },
  { codigo: "12", valor: "Otras Criptomonedas" },
  { codigo: "13", valor: "Cuentas por pagar del receptor" },
  { codigo: "14", valor: "Giro bancario" },
  { codigo: "99", valor: "Otros (se debe indicar el medio de pago)" },
];

// The codes a document may carry depend on the schema generation: see src/generacion.ts.

// CAT-015 Tributos: 20 is IVA 13%.
export const TRIBUTO_IVA = { codigo: "20", descripcion: "Impuesto al Valor Agregado 13%" } as const;

// CAT-014 Unidad de medida: 59 is "Unidad".
export const UNIDAD_MEDIDA_UNIDAD = 59;

// CAT-011 Tipo de ítem: 1 is "Bienes".
export const TIPO_ITEM_BIENES = 1;

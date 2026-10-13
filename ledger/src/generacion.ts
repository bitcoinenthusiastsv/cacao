// Schema generations the tool builds and validates against. The two differ in
// shape, in the payment-code rule and in the municipality numbering, so every
// builder and validator call receives one of them explicitly.
import { ErrorLedger } from "./errores.ts";
import { CAT_017 } from "./dte/catalogos.ts";

export type Generacion = "caso" | "2026";
export type TipoDte = "01" | "03";

export const GENERACIONES: readonly Generacion[] = ["caso", "2026"];
export const GENERACION_POR_DEFECTO: Generacion = "caso";

export interface ConfigGeneracion {
  generacion: Generacion;
  // identificacion.version the builder writes and the schema requires.
  version: Readonly<Record<TipoDte, number>>;
  // Schema file, relative to esquemas/.
  esquema: Readonly<Record<TipoDte, string>>;
  // Who published the schema file. Printed next to every validation.
  origen: string;
  // Codes CacaoLedger accepts in resumen.pagos[].codigo.
  codigosPermitidos: Readonly<Record<TipoDte, readonly string[]>>;
  // Establishment and point-of-sale codes. The numeroControl segment is their concatenation.
  codigoEstablecimiento: RegExp;
  codigoPuntoVenta: RegExp;
}

const CODIGOS_TODOS = CAT_017.map((c) => c.codigo).filter((c) => c !== "10");

export const CONFIG: Readonly<Record<Generacion, ConfigGeneracion>> = {
  caso: {
    generacion: "caso",
    version: { "01": 1, "03": 3 },
    esquema: { "01": "espejo-herson/DTE-FE-v1.json", "03": "espejo-herson/DTE-CCFE-v3.json" },
    origen: "copia del espejo comunitario herson/dte-json-schemas; no descargada del Ministerio",
    codigosPermitidos: {
      "01": ["01", "02", "03", "04", "05", "08", "09", "99"],
      "03": ["01", "02", "03", "04", "05", "08", "09", "11", "12", "13", "99"],
    },
    codigoEstablecimiento: /^[A-Z0-9]{4}$/,
    codigoPuntoVenta: /^[A-Z0-9]{4}$/,
  },
  "2026": {
    generacion: "2026",
    version: { "01": 2, "03": 4 },
    esquema: { "01": "ministerio-2026/fe-f-v2.json", "03": "ministerio-2026/fe-ccf-v4.json" },
    origen: "paquete svfe-json-schemas.zip publicado por el Ministerio de Hacienda",
    codigosPermitidos: { "01": CODIGOS_TODOS, "03": CODIGOS_TODOS },
    codigoEstablecimiento: /^[MBSP]\d{3}$/,
    codigoPuntoVenta: /^P\d{3}$/,
  },
};

// Explicit value wins, then LEDGER_ESQUEMAS, then the default.
export function resolverGeneracion(valor?: string): Generacion {
  const elegido = valor ?? process.env.LEDGER_ESQUEMAS ?? GENERACION_POR_DEFECTO;
  if (!(GENERACIONES as readonly string[]).includes(elegido)) {
    throw new ErrorLedger(`El esquema debe ser "caso" o "2026" (recibido "${elegido}").`);
  }
  return elegido as Generacion;
}

// A document carries its own generation in identificacion.version.
export function generacionDeDocumento(doc: unknown): Generacion | null {
  const ident = (doc as { identificacion?: { version?: unknown } } | null)?.identificacion;
  const version = ident?.version;
  if (version === 1 || version === 3) return "caso";
  if (version === 2 || version === 4) return "2026";
  return null;
}

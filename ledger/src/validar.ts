import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import * as formatosNs from "ajv-formats";
import { ivaIncluido, ivaSobreNeto } from "./dinero.ts";
import { raizLedger } from "./datos.ts";
import { CAT_017 } from "./dte/catalogos.ts";
import { CONFIG, resolverGeneracion, type Generacion, type TipoDte } from "./generacion.ts";

// ajv-formats is CommonJS; its default export is read through the namespace so the
// same code works under Node ESM and under tsc with nodenext.
const addFormats = (formatosNs as unknown as { default: (a: Ajv) => Ajv }).default;

// Two layers, reported separately:
//   esquema: the schema file of the chosen generation (Ajv, draft-07).
//   regla:   checks CacaoLedger adds on top, in its own words.
// A document is valid only when both layers are empty. Warnings never fail a document.

export interface Fallo {
  capa: "esquema" | "regla";
  ruta: string;
  mensaje: string;
  valor: string;
  regla: string;
}

export interface ResultadoValidacion {
  tipoDte: string | null;
  generacion: Generacion;
  archivoEsquema: string | null;
  origenEsquema: string | null;
  esquema: Fallo[];
  reglas: Fallo[];
  avisos: string[];
  ok: boolean;
}

export interface OpcionesValidacion {
  // Accept ambiente "01" (production). Off by default, matching the builder.
  permitirProduccion?: boolean;
  generacion?: Generacion;
}

let ajvInstancia: Ajv | null = null;
const compilados = new Map<string, ValidateFunction>();

function ajv(): Ajv {
  if (ajvInstancia === null) {
    // multipleOfPrecision: a float such as 0.29 divided by 0.01 is not exact, so
    // multipleOf 0.01 would reject a valid amount without it.
    // strictTypes off: the Ministry schemas give keywords such as minimum to fields that
    // are typed as a union with null, which strict mode reports as warnings on every run.
    const a = new Ajv({ allErrors: true, verbose: true, multipleOfPrecision: 2, strictTypes: false });
    addFormats(a);
    ajvInstancia = a;
  }
  return ajvInstancia;
}

function validadorPara(generacion: Generacion, tipo: TipoDte): ValidateFunction {
  const archivo = CONFIG[generacion].esquema[tipo];
  const previo = compilados.get(archivo);
  if (previo) return previo;
  const ruta = join(raizLedger(), "esquemas", archivo);
  const esquema = JSON.parse(readFileSync(ruta, "utf8")) as object;
  const fn = ajv().compile(esquema);
  compilados.set(archivo, fn);
  return fn;
}

// instancePath "/resumen/pagos/0/codigo" -> "resumen.pagos[0].codigo"
function rutaDesde(instancePath: string): string {
  if (instancePath === "") return "(raíz)";
  return instancePath
    .split("/")
    .slice(1)
    .map((seg) => (/^\d+$/.test(seg) ? `[${seg}]` : `.${seg}`))
    .join("")
    .replace(/^\./, "");
}

function valorTexto(v: unknown): string {
  if (v === undefined) return "(ausente)";
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function tiposEs(tipo: unknown): string {
  const mapa: Record<string, string> = {
    string: "texto",
    number: "número",
    integer: "número entero",
    array: "lista",
    object: "objeto",
    null: "nulo",
    boolean: "booleano",
  };
  return String(tipo)
    .split(",")
    .map((t) => mapa[t] ?? t)
    .join(" o ");
}

// Spanish text for each Ajv keyword. The rule keyword is kept beside it for the report.
function traducirError(e: ErrorObject): Fallo {
  const p = (e.params ?? {}) as Record<string, unknown>;
  let ruta = rutaDesde(e.instancePath);
  let mensaje: string;
  switch (e.keyword) {
    case "required":
      ruta = ruta === "(raíz)" ? String(p.missingProperty) : `${ruta}.${String(p.missingProperty)}`;
      mensaje = "falta un campo obligatorio";
      break;
    case "additionalProperties":
      ruta = ruta === "(raíz)" ? String(p.additionalProperty) : `${ruta}.${String(p.additionalProperty)}`;
      mensaje = "campo no permitido por el esquema";
      break;
    case "type":
      mensaje = `debe ser ${tiposEs(p.type)}`;
      break;
    case "const":
      mensaje = `debe ser ${JSON.stringify(p.allowedValue)}`;
      break;
    case "enum":
      mensaje = `debe ser uno de ${(p.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`;
      break;
    case "pattern":
      mensaje = `no cumple el patrón ${String(p.pattern)}`;
      break;
    case "format":
      mensaje = `no tiene el formato ${String(p.format)}`;
      break;
    case "maxLength":
      mensaje = `supera ${String(p.limit)} caracteres`;
      break;
    case "minLength":
      mensaje = `tiene menos de ${String(p.limit)} caracteres`;
      break;
    case "multipleOf":
      mensaje = `debe ser múltiplo de ${String(p.multipleOf)} (como máximo dos decimales)`;
      break;
    case "minimum":
    case "exclusiveMinimum":
    case "maximum":
    case "exclusiveMaximum":
      mensaje = `fuera de rango (${e.keyword} ${String(p.limit)})`;
      break;
    case "maxItems":
      mensaje = `tiene más de ${String(p.limit)} elementos`;
      break;
    case "minItems":
      mensaje = `tiene menos de ${String(p.limit)} elementos`;
      break;
    default:
      mensaje = `no cumple la regla ${e.keyword}`;
  }
  const valor = e.keyword === "required" ? "(ausente)" : valorTexto(e.data);
  return { capa: "esquema", ruta, mensaje, valor, regla: e.keyword };
}

function falloRegla(ruta: string, mensaje: string, valor: unknown, regla: string): Fallo {
  return { capa: "regla", ruta, mensaje, valor: valorTexto(valor), regla };
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function centavos(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null;
}

const CODIGOS_BITCOIN = ["11", "12"];

// Rules that go beyond the schema. The payment-code check is the one that matters most.
// Under "caso" a Bitcoin code on a 01 fails here as well as in the schema. Under "2026"
// the schema allows it, so it becomes a warning: the reception service is untested.
function reglasCacao(
  doc: Record<string, unknown>,
  tipo: TipoDte,
  generacion: Generacion,
  opciones: OpcionesValidacion,
  avisos: string[],
): Fallo[] {
  const fallos: Fallo[] = [];
  const ident = obj(doc.identificacion);
  if (ident.ambiente === "01" && opciones.permitirProduccion !== true) {
    fallos.push(
      falloRegla(
        "identificacion.ambiente",
        '"01" es producción. Sin --confirmar-produccion este documento se rechaza.',
        ident.ambiente,
        "ambiente-produccion",
      ),
    );
  }

  const resumen = obj(doc.resumen);
  const pagos = Array.isArray(resumen.pagos) ? (resumen.pagos as unknown[]) : [];
  if (pagos.length === 0) {
    fallos.push(falloRegla("resumen.pagos", "el documento no registra ninguna forma de pago", resumen.pagos, "pago-obligatorio"));
  }
  const permitidos = CONFIG[generacion].codigosPermitidos[tipo];
  pagos.forEach((raw, i) => {
    const codigo = obj(raw).codigo;
    const ruta = `resumen.pagos[${i}].codigo`;
    // An empty code is refused in both generations. The official pattern of "caso"
    // matches the empty string through its empty alternations, so only this rule catches it.
    if (codigo === "") {
      fallos.push(
        falloRegla(ruta, `código vacío: no es un código de CAT-017. Permitidos: ${permitidos.join(", ")}`, codigo, `codigo-cat-017-${tipo}`),
      );
      return;
    }
    if (typeof codigo === "string" && permitidos.includes(codigo)) {
      if (tipo === "01" && CODIGOS_BITCOIN.includes(codigo) && generacion === "2026") {
        avisos.push(
          `Código ${codigo} (Bitcoin) en factura 01: el esquema 2026 lo permite y CAT-017 lo incluye. ` +
            "La recepción del Ministerio no fue probada con este código.",
        );
      }
      return;
    }
    const nombre = CAT_017.find((c) => c.codigo === codigo)?.valor;
    let mensaje: string;
    if (codigo === "11" && tipo === "01") {
      mensaje = "Bitcoin (11) no se declara en una factura de consumidor final (01). Usá 99 (Otros) con la referencia del pago";
    } else if (nombre) {
      mensaje = `"${codigo}" (${nombre}) no está permitido en el tipo ${tipo} con el esquema ${generacion}`;
    } else {
      mensaje = `"${String(codigo)}" no es un código de CAT-017 permitido en el tipo ${tipo}`;
    }
    fallos.push(falloRegla(ruta, `${mensaje}. Permitidos: ${permitidos.join(", ")}`, codigo, `codigo-cat-017-${tipo}`));
  });

  // Arithmetic: every total must match the lines, to the cent.
  const cuerpo = Array.isArray(doc.cuerpoDocumento) ? (doc.cuerpoDocumento as unknown[]) : [];
  if (cuerpo.length > 0) {
    const lineas = cuerpo.map(obj);
    const sumaVentas = lineas.reduce((a, l) => a + (centavos(l.ventaGravada) ?? 0), 0);
    const comparar = (ruta: string, real: unknown, esperado: number, regla: string) => {
      const r = centavos(real);
      if (r !== esperado) {
        fallos.push(falloRegla(ruta, `no cuadra con las líneas: se esperaba ${(esperado / 100).toFixed(2)}`, real, regla));
      }
    };
    comparar("resumen.totalGravada", resumen.totalGravada, sumaVentas, "aritmetica-gravado");
    comparar("resumen.subTotal", resumen.subTotal, sumaVentas, "aritmetica-subtotal");
    if (tipo === "01") {
      const sumaIva = lineas.reduce((a, l) => a + (centavos(l.ivaItem) ?? 0), 0);
      const ivaEsperado = lineas.reduce((a, l) => a + ivaIncluido(centavos(l.ventaGravada) ?? 0), 0);
      comparar("resumen.totalIva", resumen.totalIva, sumaIva, "aritmetica-iva");
      if (sumaIva !== ivaEsperado) {
        fallos.push(falloRegla("cuerpoDocumento[].ivaItem", "el IVA de algún ítem no es 13/113 de su precio", sumaIva / 100, "aritmetica-iva-item"));
      }
      comparar("resumen.montoTotalOperacion", resumen.montoTotalOperacion, sumaVentas, "aritmetica-total");
      comparar("resumen.totalPagar", resumen.totalPagar, sumaVentas, "aritmetica-total");
    } else {
      const sumaIva = lineas.reduce((a, l) => a + ivaSobreNeto(centavos(l.ventaGravada) ?? 0), 0);
      const tributos = Array.isArray(resumen.tributos) ? (resumen.tributos as unknown[]) : [];
      const iva = obj(tributos[0]).valor;
      comparar("resumen.tributos[0].valor", iva, sumaIva, "aritmetica-iva");
      comparar("resumen.montoTotalOperacion", resumen.montoTotalOperacion, sumaVentas + sumaIva, "aritmetica-total");
      comparar("resumen.totalPagar", resumen.totalPagar, sumaVentas + sumaIva, "aritmetica-total");
    }
    const pagado = pagos.reduce<number>((a, p) => a + (centavos(obj(p).montoPago) ?? 0), 0);
    const totalPagar = centavos(resumen.totalPagar);
    if (totalPagar !== null && pagado !== totalPagar) {
      fallos.push(falloRegla("resumen.pagos", "la suma de montoPago no es igual a totalPagar", pagado / 100, "aritmetica-pagos"));
    }
  }
  return fallos;
}

// Validate any DTE object. Never throws on malformed input: problems come back as failures.
export function validarDte(doc: unknown, opciones: OpcionesValidacion = {}): ResultadoValidacion {
  const generacion = resolverGeneracion(opciones.generacion);
  const raiz = obj(doc);
  const tipoTexto = typeof obj(raiz.identificacion).tipoDte === "string" ? (obj(raiz.identificacion).tipoDte as string) : null;
  const tipo = tipoTexto === "01" || tipoTexto === "03" ? (tipoTexto as TipoDte) : null;
  if (tipo === null) {
    const valor = tipoTexto ?? "(ausente)";
    return {
      tipoDte: tipoTexto,
      generacion,
      archivoEsquema: null,
      origenEsquema: null,
      esquema: [],
      reglas: [
        falloRegla(
          "identificacion.tipoDte",
          `tipo de documento no soportado. CacaoLedger valida 01 y 03; recibido: ${valor}`,
          valor,
          "tipo-soportado",
        ),
      ],
      avisos: [],
      ok: false,
    };
  }
  const validar = validadorPara(generacion, tipo);
  const esquema = validar(doc) ? [] : (validar.errors ?? []).map(traducirError);
  const avisos: string[] = [];
  const reglas = reglasCacao(raiz, tipo, generacion, opciones, avisos);
  return {
    tipoDte: tipo,
    generacion,
    archivoEsquema: CONFIG[generacion].esquema[tipo],
    origenEsquema: CONFIG[generacion].origen,
    esquema,
    reglas,
    avisos,
    ok: esquema.length === 0 && reglas.length === 0,
  };
}

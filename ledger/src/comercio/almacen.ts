import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { escribirJson, leerJson } from "../datos.ts";
import { ErrorLedger } from "../errores.ts";
import {
  cifrarEnvelope,
  claveMaestraDesdeEntorno,
  descifrarEnvelope,
  type EnvelopeCifrado,
  type SobreCifrado,
} from "./cifrado.ts";

// Per-merchant credential storage. Private key material and the certificate password
// live only inside envelope-encrypted blobs; the master key comes from LEDGER_CLAVE_MAESTRA.

const ID_COMERCIO = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface MaterialCertificado {
  passwordPri: string;
  clavePrivadaPem: string;
}

export interface RegistroComercio {
  id: string;
  nit: string;
  creado: string;
  sobreDek: SobreCifrado;
  material: SobreCifrado;
}

export interface IndiceComercios {
  comercioActivo: string | null;
  comercios: { id: string; nit: string; creado: string }[];
}

function dirComercios(dirDatos: string): string {
  return join(dirDatos, "comercios");
}

function rutaIndice(dirDatos: string): string {
  return join(dirComercios(dirDatos), "indice.json");
}

function rutaComercio(dirDatos: string, id: string): string {
  validarIdComercio(id);
  return join(dirComercios(dirDatos), `${id}.json`);
}

export function validarIdComercio(id: string): void {
  if (!ID_COMERCIO.test(id)) {
    throw new ErrorLedger(
      `El identificador de comercio "${id}" no es válido (usá minúsculas, números y guiones, hasta 63 caracteres).`,
    );
  }
}

export function leerIndiceComercios(dirDatos: string): IndiceComercios {
  const ruta = rutaIndice(dirDatos);
  if (!existsSync(ruta)) {
    return { comercioActivo: null, comercios: [] };
  }
  const raw = leerJson(ruta) as IndiceComercios;
  return {
    comercioActivo: raw.comercioActivo ?? null,
    comercios: Array.isArray(raw.comercios) ? raw.comercios : [],
  };
}

function guardarIndice(dirDatos: string, indice: IndiceComercios): void {
  escribirJson(rutaIndice(dirDatos), indice);
}

export function registrarComercio(
  dirDatos: string,
  id: string,
  nit: string,
  material: MaterialCertificado,
  claveMaestra: Buffer,
  ahora: Date = new Date(),
): RegistroComercio {
  validarIdComercio(id);
  if (!/^\d{14}$/.test(nit)) {
    throw new ErrorLedger("El NIT del comercio debe tener 14 dígitos.");
  }
  if (material.passwordPri.length < 8) {
    throw new ErrorLedger("La contraseña de la clave privada debe tener al menos 8 caracteres.");
  }
  if (!material.clavePrivadaPem.includes("BEGIN")) {
    throw new ErrorLedger("La clave privada debe ser un archivo PEM.");
  }
  const ruta = rutaComercio(dirDatos, id);
  if (existsSync(ruta)) {
    throw new ErrorLedger(`Ya existe el comercio "${id}".`);
  }
  const env = cifrarEnvelope(claveMaestra, Buffer.from(JSON.stringify(material), "utf8"));
  const registro: RegistroComercio = {
    id,
    nit,
    creado: ahora.toISOString(),
    sobreDek: env.sobreDek,
    material: env.payload,
  };
  escribirJson(ruta, registro);
  const indice = leerIndiceComercios(dirDatos);
  indice.comercios.push({ id, nit, creado: registro.creado });
  if (!indice.comercioActivo) indice.comercioActivo = id;
  guardarIndice(dirDatos, indice);
  return registro;
}

export function leerRegistroComercio(dirDatos: string, id: string): RegistroComercio {
  const ruta = rutaComercio(dirDatos, id);
  if (!existsSync(ruta)) {
    throw new ErrorLedger(`No existe el comercio "${id}" en ${dirDatos}.`);
  }
  return leerJson(ruta) as RegistroComercio;
}

export function descifrarMaterialComercio(
  dirDatos: string,
  id: string,
  claveMaestra: Buffer,
): MaterialCertificado {
  const reg = leerRegistroComercio(dirDatos, id);
  const env: EnvelopeCifrado = { sobreDek: reg.sobreDek, payload: reg.material };
  let texto: Buffer;
  try {
    texto = descifrarEnvelope(claveMaestra, env);
  } catch {
    throw new ErrorLedger(`No se pudo descifrar el material del comercio "${id}" (¿clave maestra incorrecta?).`);
  }
  const parsed = JSON.parse(texto.toString("utf8")) as MaterialCertificado;
  if (typeof parsed.passwordPri !== "string" || typeof parsed.clavePrivadaPem !== "string") {
    throw new ErrorLedger(`El material del comercio "${id}" está dañado.`);
  }
  return parsed;
}

export function resolverComercioActivo(dirDatos: string, preferido?: string): string {
  const indice = leerIndiceComercios(dirDatos);
  const id = preferido ?? indice.comercioActivo;
  if (!id) {
    throw new ErrorLedger(
      'No hay comercio registrado. Registrá uno con: comercio registrar <id> --nit ... --password-pri ... --clave-privada <archivo.pem>',
    );
  }
  validarIdComercio(id);
  if (!indice.comercios.some((c) => c.id === id)) {
    throw new ErrorLedger(`El comercio "${id}" no está registrado.`);
  }
  return id;
}

export function leerClavePrivadaPem(ruta: string): string {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    throw new ErrorLedger(`No se puede leer la clave privada en "${ruta}".`);
  }
}

export function claveMaestraDeEntorno(): Buffer {
  const texto = process.env.LEDGER_CLAVE_MAESTRA;
  if (!texto?.trim()) {
    throw new ErrorLedger(
      "Falta la variable LEDGER_CLAVE_MAESTRA (clave maestra para descifrar credenciales de comercio).",
    );
  }
  try {
    return claveMaestraDesdeEntorno(texto);
  } catch {
    throw new ErrorLedger("La variable LEDGER_CLAVE_MAESTRA no se pudo interpretar.");
  }
}

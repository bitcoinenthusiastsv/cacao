import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM envelope helpers. The master key never leaves this module as plain text in logs.

const VERSION = 1;
const ALG = "aes-256-gcm";
const IV_BYTES = 12;

export interface SobreCifrado {
  v: typeof VERSION;
  alg: typeof ALG;
  iv: string;
  tag: string;
  datos: string;
}

function claveDesdeMaterial(material: string | Buffer): Buffer {
  const buf = typeof material === "string" ? Buffer.from(material, "utf8") : material;
  if (buf.length === 32) return buf;
  return createHash("sha256").update(buf).digest();
}

export function claveMaestraDesdeEntorno(texto: string): Buffer {
  const t = texto.trim();
  if (!t) throw new Error("La clave maestra está vacía.");
  if (/^[0-9a-fA-F]{64}$/.test(t)) return Buffer.from(t, "hex");
  try {
    const b64 = Buffer.from(t, "base64");
    if (b64.length === 32) return b64;
  } catch {
    /* pass */
  }
  return claveDesdeMaterial(t);
}

export function generarDek(): Buffer {
  return randomBytes(32);
}

export function cifrarConClave(clave: Buffer, textoPlano: Buffer): SobreCifrado {
  const iv = randomBytes(IV_BYTES);
  const cifrador = createCipheriv(ALG, claveDesdeMaterial(clave), iv);
  const cifrado = Buffer.concat([cifrador.update(textoPlano), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return {
    v: VERSION,
    alg: ALG,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    datos: cifrado.toString("base64"),
  };
}

export function descifrarConClave(clave: Buffer, sobre: SobreCifrado): Buffer {
  if (sobre.v !== VERSION || sobre.alg !== ALG) {
    throw new Error("Formato de sobre cifrado no reconocido.");
  }
  const iv = Buffer.from(sobre.iv, "base64");
  const tag = Buffer.from(sobre.tag, "base64");
  const datos = Buffer.from(sobre.datos, "base64");
  const descifrador = createDecipheriv(ALG, claveDesdeMaterial(clave), iv);
  descifrador.setAuthTag(tag);
  return Buffer.concat([descifrador.update(datos), descifrador.final()]);
}

export interface EnvelopeCifrado {
  sobreDek: SobreCifrado;
  payload: SobreCifrado;
}

export function cifrarEnvelope(claveMaestra: Buffer, textoPlano: Buffer): EnvelopeCifrado {
  const dek = generarDek();
  return {
    sobreDek: cifrarConClave(claveMaestra, dek),
    payload: cifrarConClave(dek, textoPlano),
  };
}

export function descifrarEnvelope(claveMaestra: Buffer, env: EnvelopeCifrado): Buffer {
  const dek = descifrarConClave(claveMaestra, env.sobreDek);
  return descifrarConClave(dek, env.payload);
}

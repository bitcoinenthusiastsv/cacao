import type { IncomingMessage, ServerResponse } from "node:http";
import { AlmacenJuego } from "./almacen.ts";
import { PREGUNTAS, preguntaPublica } from "./quiz.ts";

const COOKIE = "cacao_juego_sesion";

export type ContextoApi = {
  almacen: AlmacenJuego;
};

function leerCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    req.on("data", (c) => partes.push(c));
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJson(texto: string): unknown {
  if (!texto.trim()) return {};
  return JSON.parse(texto) as unknown;
}

function tokenDeCookie(req: IncomingMessage): string | undefined {
  const raw = req.headers.cookie ?? "";
  for (const par of raw.split(";")) {
    const [k, ...rest] = par.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function fijarCookie(res: ServerResponse, token: string): void {
  const seguro = process.env.VERCEL ? "; Secure" : "";
  const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${seguro}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; ${flags}`);
}

function json(res: ServerResponse, codigo: number, cuerpo: unknown): void {
  res.statusCode = codigo;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(cuerpo)}\n`);
}

function rechazarCamposProhibidos(body: Record<string, unknown>): string | null {
  if ("saldo" in body) return "saldo_servidor";
  if ("balance" in body) return "saldo_servidor";
  if ("monto" in body) return "saldo_servidor";
  if ("sats" in body && typeof body.sats === "number") return "saldo_servidor";
  return null;
}

export async function manejarApi(
  req: IncomingMessage,
  res: ServerResponse,
  ruta: string,
  ctx: ContextoApi,
): Promise<boolean> {
  if (!ruta.startsWith("/api/")) return false;

  const metodo = req.method ?? "GET";

  if (ruta === "/api/sesion" && metodo === "POST") {
    const body = parseJson(await leerCuerpo(req)) as Record<string, unknown>;
    const rechazo = rechazarCamposProhibidos(body);
    if (rechazo) {
      json(res, 400, { ok: false, codigo: rechazo });
      return true;
    }
    const nombre = typeof body.nombre === "string" ? body.nombre : "";
    try {
      const { sesion, jugador } = ctx.almacen.iniciarJugador(nombre);
      fijarCookie(res, sesion.token);
      json(res, 200, {
        ok: true,
        jugador: { id: jugador.id, nombre: jugador.nombre, saldo: jugador.saldo },
        sesionId: sesion.id,
      });
    } catch (e) {
      const codigo = e instanceof Error && e.message === "nombre_corto" ? "nombre_corto" : "error";
      json(res, 400, { ok: false, codigo });
    }
    return true;
  }

  const token = tokenDeCookie(req);

  if (ruta === "/api/estado" && metodo === "GET") {
    if (!token) {
      json(res, 401, { ok: false, codigo: "sin_sesion" });
      return true;
    }
    const sesion = ctx.almacen.buscarSesionPorToken(token);
    if (!sesion) {
      json(res, 401, { ok: false, codigo: "sesion_invalida" });
      return true;
    }
    const jugador = ctx.almacen.jugadorPorId(sesion.jugadorId);
    const partida = ctx.almacen.partidaPorId(sesion.partidaId);
    if (!jugador || !partida) {
      json(res, 500, { ok: false, codigo: "estado_roto" });
      return true;
    }
    const preguntas = PREGUNTAS.map((p, i) => preguntaPublica(p, i));
    json(res, 200, {
      ok: true,
      nombre: jugador.nombre,
      saldo: jugador.saldo,
      preguntas,
      indiceActual: partida.respondidas,
      terminada: partida.terminadaEn !== null,
      historial: ctx.almacen.historialJugador(jugador.id).slice(0, 20),
    });
    return true;
  }

  if (ruta === "/api/responder" && metodo === "POST") {
    if (!token) {
      json(res, 401, { ok: false, codigo: "sin_sesion" });
      return true;
    }
    const body = parseJson(await leerCuerpo(req)) as Record<string, unknown>;
    const rechazo = rechazarCamposProhibidos(body);
    if (rechazo) {
      json(res, 400, { ok: false, codigo: rechazo });
      return true;
    }
    const indice = typeof body.indice === "number" ? body.indice : NaN;
    const opcion = typeof body.opcion === "number" ? body.opcion : NaN;
    const resultado = ctx.almacen.responder(token, indice, opcion);
    if (!resultado.ok) {
      json(res, 400, { ok: false, codigo: resultado.codigo });
      return true;
    }
    json(res, 200, resultado);
    return true;
  }

  if (ruta === "/api/tabla" && metodo === "GET") {
    const tabla = ctx.almacen.tablaPosiciones().map((j) => ({
      nombre: j.nombre,
      saldo: j.saldo,
    }));
    json(res, 200, { ok: true, tabla });
    return true;
  }

  if (ruta === "/api/historial" && metodo === "GET") {
    if (!token) {
      json(res, 401, { ok: false, codigo: "sin_sesion" });
      return true;
    }
    const sesion = ctx.almacen.buscarSesionPorToken(token);
    if (!sesion) {
      json(res, 401, { ok: false, codigo: "sesion_invalida" });
      return true;
    }
    json(res, 200, {
      ok: true,
      entradas: ctx.almacen.historialJugador(sesion.jugadorId),
    });
    return true;
  }

  json(res, 404, { ok: false, codigo: "ruta_api" });
  return true;
}

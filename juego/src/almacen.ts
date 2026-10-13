import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { dirDatos, escribirJson, leerJson } from "./datos.ts";
import {
  aplicarTopePartida,
  calcularPremio,
  idLogro,
} from "./economia.ts";
import { esRespuestaCorrecta, TOTAL_PREGUNTAS } from "./quiz.ts";

export type Jugador = {
  id: string;
  nombre: string;
  saldo: number;
  creadoEn: string;
};

export type EntradaHistorial = {
  id: string;
  jugadorId: string;
  sesionId: string;
  logroId: string;
  indicePregunta: number;
  sats: number;
  cuando: string;
  detalle: string;
};

export type Partida = {
  id: string;
  jugadorId: string;
  sesionId: string;
  iniciadaEn: string;
  terminadaEn: string | null;
  rachaActual: number;
  satsEnPartida: number;
  respondidas: number;
  aciertos: number;
};

export type Sesion = {
  id: string;
  token: string;
  jugadorId: string;
  partidaId: string;
  creadaEn: string;
  expiraEn: string;
};

export type EstadoAlmacen = {
  jugadores: Jugador[];
  historial: EntradaHistorial[];
  partidas: Partida[];
  sesiones: Sesion[];
  logrosCobrados: string[];
};

function archivoEstado(carpeta: string): string {
  return join(carpeta, "estado.json");
}

export function estadoVacio(): EstadoAlmacen {
  return {
    jugadores: [],
    historial: [],
    partidas: [],
    sesiones: [],
    logrosCobrados: [],
  };
}

export function cargarEstado(carpeta?: string): EstadoAlmacen {
  const dir = dirDatos(carpeta);
  const ruta = archivoEstado(dir);
  if (!existsSync(ruta)) return estadoVacio();
  const raw = leerJson(ruta) as EstadoAlmacen;
  return {
    jugadores: raw.jugadores ?? [],
    historial: raw.historial ?? [],
    partidas: raw.partidas ?? [],
    sesiones: raw.sesiones ?? [],
    logrosCobrados: raw.logrosCobrados ?? [],
  };
}

export function guardarEstado(estado: EstadoAlmacen, carpeta?: string): void {
  escribirJson(archivoEstado(dirDatos(carpeta)), estado);
}

export class AlmacenJuego {
  private estado: EstadoAlmacen;
  private readonly carpeta: string | undefined;

  constructor(carpeta?: string) {
    this.carpeta = carpeta;
    this.estado = cargarEstado(carpeta);
  }

  snapshot(): EstadoAlmacen {
    return structuredClone(this.estado);
  }

  private persistir(): void {
    guardarEstado(this.estado, this.carpeta);
  }

  buscarSesionPorToken(token: string): Sesion | undefined {
    return this.estado.sesiones.find((s) => s.token === token);
  }

  jugadorPorId(id: string): Jugador | undefined {
    return this.estado.jugadores.find((j) => j.id === id);
  }

  partidaPorId(id: string): Partida | undefined {
    return this.estado.partidas.find((p) => p.id === id);
  }

  iniciarJugador(nombre: string): { sesion: Sesion; jugador: Jugador; partida: Partida } {
    const limpio = nombre.trim().slice(0, 40);
    if (limpio.length < 2) {
      throw new Error("nombre_corto");
    }
    let jugador = this.estado.jugadores.find(
      (j) => j.nombre.toLowerCase() === limpio.toLowerCase(),
    );
    if (!jugador) {
      jugador = {
        id: randomUUID(),
        nombre: limpio,
        saldo: 0,
        creadoEn: new Date().toISOString(),
      };
      this.estado.jugadores.push(jugador);
    }
    const ahora = new Date();
    const sesionId = randomUUID();
    const partidaId = randomUUID();
    const partida: Partida = {
      id: partidaId,
      jugadorId: jugador.id,
      sesionId,
      iniciadaEn: ahora.toISOString(),
      terminadaEn: null,
      rachaActual: 0,
      satsEnPartida: 0,
      respondidas: 0,
      aciertos: 0,
    };
    const sesion: Sesion = {
      id: sesionId,
      token: randomUUID(),
      jugadorId: jugador.id,
      partidaId,
      creadaEn: ahora.toISOString(),
      expiraEn: new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };
    this.estado.partidas.push(partida);
    this.estado.sesiones.push(sesion);
    this.persistir();
    return { sesion, jugador, partida };
  }

  historialJugador(jugadorId: string): EntradaHistorial[] {
    return this.estado.historial
      .filter((h) => h.jugadorId === jugadorId)
      .sort((a, b) => b.cuando.localeCompare(a.cuando));
  }

  tablaPosiciones(limite = 50): Jugador[] {
    return [...this.estado.jugadores].sort((a, b) => {
      if (b.saldo !== a.saldo) return b.saldo - a.saldo;
      return a.nombre.localeCompare(b.nombre, "es");
    }).slice(0, limite);
  }

  responder(
    token: string,
    indicePregunta: number,
    opcion: number,
  ): {
    ok: boolean;
    codigo?: string;
    correcta?: boolean;
    satsOtorgados?: number;
    saldo?: number;
    aviso?: string;
    terminada?: boolean;
    respondidas?: number;
  } {
    if (!Number.isInteger(indicePregunta) || indicePregunta < 0 || indicePregunta >= TOTAL_PREGUNTAS) {
      return { ok: false, codigo: "pregunta_invalida" };
    }
    if (!Number.isInteger(opcion) || opcion < 0 || opcion > 3) {
      return { ok: false, codigo: "opcion_invalida" };
    }
    const sesion = this.buscarSesionPorToken(token);
    if (!sesion) return { ok: false, codigo: "sesion_invalida" };
    if (new Date(sesion.expiraEn).getTime() < Date.now()) {
      return { ok: false, codigo: "sesion_expirada" };
    }
    const partida = this.partidaPorId(sesion.partidaId);
    const jugador = this.jugadorPorId(sesion.jugadorId);
    if (!partida || !jugador) return { ok: false, codigo: "estado_roto" };
    if (partida.terminadaEn) return { ok: false, codigo: "partida_cerrada" };
    if (partida.respondidas !== indicePregunta) {
      return { ok: false, codigo: "orden_incorrecto" };
    }

    const logro = idLogro(sesion.id, indicePregunta);
    if (this.estado.logrosCobrados.includes(logro)) {
      return { ok: false, codigo: "logro_ya_cobrado" };
    }

    const correcta = esRespuestaCorrecta(indicePregunta, opcion);
    partida.respondidas += 1;
    let satsOtorgados = 0;
    let aviso = correcta
      ? "Buena, esa es la respuesta correcta."
      : "Esta vez no cuadró. Seguí intentando en la siguiente.";

    if (correcta) {
      partida.aciertos += 1;
      partida.rachaActual += 1;
      const bruto = calcularPremio(partida.rachaActual);
      satsOtorgados = aplicarTopePartida(partida.satsEnPartida, bruto);
      if (satsOtorgados > 0) {
        partida.satsEnPartida += satsOtorgados;
        jugador.saldo += satsOtorgados;
        this.estado.logrosCobrados.push(logro);
        const entrada: EntradaHistorial = {
          id: randomUUID(),
          jugadorId: jugador.id,
          sesionId: sesion.id,
          logroId: logro,
          indicePregunta,
          sats: satsOtorgados,
          cuando: new Date().toISOString(),
          detalle: `Acierto pregunta ${indicePregunta + 1}, racha ${partida.rachaActual}`,
        };
        this.estado.historial.push(entrada);
        aviso = `Sumaste ${satsOtorgados} sats simulados. Van ${jugador.saldo} en total.`;
        if (partida.rachaActual >= 2) {
          aviso += ` Racha de ${partida.rachaActual} aciertos seguidos.`;
        }
      } else {
        aviso = "Llegaste al tope de sats de esta partida. El acierto cuenta, pero ya no suma premio.";
        this.estado.logrosCobrados.push(logro);
      }
    } else {
      partida.rachaActual = 0;
    }

    if (partida.respondidas >= TOTAL_PREGUNTAS) {
      partida.terminadaEn = new Date().toISOString();
    }

    this.persistir();
    return {
      ok: true,
      correcta,
      satsOtorgados,
      saldo: jugador.saldo,
      aviso,
      terminada: partida.terminadaEn !== null,
      respondidas: partida.respondidas,
    };
  }

  /** Rechaza intentos de fijar saldo desde afuera. */
  intentoFijarSaldo(): { ok: false; codigo: string } {
    return { ok: false, codigo: "saldo_servidor" };
  }
}

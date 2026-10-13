import type { EntradaHistorial, Jugador } from "../almacen.ts";
import { leerRecurso } from "../recursos.ts";
import { TOTAL_PREGUNTAS } from "../quiz.ts";
import { SATS_POR_ACIERTO, TOPE_PARTIDA } from "../economia.ts";
import { escapar } from "./escapar.ts";

function cssInline(): string {
  return leerRecurso("estilo.css", import.meta.url);
}

function layout(titulo: string, cuerpo: string, extraHead = ""): string {
  return `<!DOCTYPE html>
<html lang="es-SV">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} · Cacao Juego</title>
<style>${cssInline()}</style>
${extraHead}
</head>
<body>
<header class="cabecera">
<p class="marca">Cacao <span>Juego</span></p>
<p class="lema">Sats simulados del Grupo Cacao. Sin valor real.</p>
<nav class="nav" aria-label="Principal">
<a href="/">Inicio</a>
<a href="/jugar">Jugar</a>
<a href="/tabla">Tabla</a>
${process.env.VERCEL && !process.env.CACAO_JUEGO_ADMIN ? "" : `<a href="/admin">Admin</a>`}
</nav>
</header>
<p class="cinta">Quiz de ${TOTAL_PREGUNTAS} preguntas sobre El Salvador · ${SATS_POR_ACIERTO} sats por acierto · tope ${TOPE_PARTIDA} por partida</p>
<main class="contenido">
${cuerpo}
</main>
<nav class="grupo" aria-label="Productos del grupo Cacao">
<p class="nota">Grupo Cacao</p>
<ul>
<li><a href="https://cacao-media.vercel.app">cacaomedia</a></li>
<li><a href="https://cacao-travel.vercel.app">cacaotravel</a></li>
<li><a href="https://cacao-market.vercel.app">cacaomarket</a></li>
<li><a href="https://cacao-pay.vercel.app">cacaopay</a></li>
<li><a href="https://cacao-ledger.vercel.app">cacaoledger</a></li>
<li><span>cacaojuego</span></li>
</ul>
</nav>
</body>
</html>`;
}

export function paginaInicio(): string {
  const cuerpo = `
<section class="tarjeta">
<h1>Probá cuánto sabés de cacao, cocina y lugares</h1>
<p>Escribí tu nombre, respondé las ${TOTAL_PREGUNTAS} preguntas y el servidor te acredita sats simulados solo cuando acertás. Vos no podés mandar el saldo.</p>
<form id="form-inicio" action="/jugar" method="get">
<label for="nombre">Tu nombre o apodo</label>
<input id="nombre" name="nombre" type="text" autocomplete="nickname" maxlength="40" required placeholder="Por ejemplo: Maza">
<p style="margin-top:1rem"><button type="submit">Empezar quiz</button></p>
</form>
<p class="nota">Al jugar aceptás que los sats son de demostración, no se canjean ni se retiran.</p>
</section>`;
  return layout("Inicio", cuerpo);
}

export function paginaJugar(nombrePrefill: string): string {
  const cuerpo = `
<section class="tarjeta">
<h1>Tu partida</h1>
<p>Jugador: <strong id="nombre-jugador">${escapar(nombrePrefill || "…")}</strong> · Saldo: <span class="saldo-pill" id="saldo">0</span> sats simulados</p>
<div id="aviso" class="aviso" role="status" aria-live="polite"></div>
<div id="zona-quiz" hidden>
<p class="nota" id="progreso"></p>
<h2 id="texto-pregunta"></h2>
<div class="opciones" id="opciones"></div>
</div>
<div id="zona-fin" hidden>
<p id="texto-fin"></p>
<p><a class="boton" href="/tabla">Ver tabla de posiciones</a></p>
</div>
<p id="zona-carga">Preparando sesión…</p>
</section>
<script type="module" src="/static/jugar.mjs"></script>`;
  return layout("Jugar", cuerpo);
}

export function paginaTabla(jugadores: Jugador[]): string {
  const filas = jugadores
    .map(
      (j, i) =>
        `<tr><td>${i + 1}</td><td>${escapar(j.nombre)}</td><td>${j.saldo}</td></tr>`,
    )
    .join("");
  const cuerpo = `
<section class="tarjeta">
<h1>Tabla de posiciones</h1>
<p class="nota">Ordenada por saldo total de sats simulados.</p>
<table class="tabla">
<thead><tr><th>#</th><th>Jugador</th><th>Sats</th></tr></thead>
<tbody>${filas || '<tr><td colspan="3">Todavía no hay partidas.</td></tr>'}</tbody>
</table>
</section>`;
  return layout("Tabla", cuerpo);
}

export function paginaAdmin(resumen: {
  jugadores: number;
  partidas: number;
  satsOtorgados: number;
  ultimos: EntradaHistorial[];
  nombres: Map<string, string>;
}): string {
  const items = resumen.ultimos
    .map((h) => {
      const nom = escapar(resumen.nombres.get(h.jugadorId) ?? h.jugadorId);
      return `<li><time datetime="${escapar(h.cuando)}">${escapar(h.cuando.slice(0, 19))}</time> · ${nom} · +${h.sats} sats · ${escapar(h.detalle)}</li>`;
    })
    .join("");
  const cuerpo = `
<section class="tarjeta">
<h1>Vista admin</h1>
<p class="nota">Resumen local del almacén en disco. Sin contraseña en este MVP.</p>
<ul class="lista-historial" style="list-style:disc;padding-left:1.25rem">
<li>Jugadores registrados: <strong>${resumen.jugadores}</strong></li>
<li>Partidas guardadas: <strong>${resumen.partidas}</strong></li>
<li>Sats simulados otorgados (histórico): <strong>${resumen.satsOtorgados}</strong></li>
</ul>
<h2>Últimos premios</h2>
<ul class="lista-historial">${items || "<li>Sin movimientos todavía.</li>"}</ul>
</section>`;
  return layout("Admin", cuerpo);
}

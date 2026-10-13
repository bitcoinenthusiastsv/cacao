const params = new URLSearchParams(window.location.search);
const nombre = params.get("nombre")?.trim() ?? "";
const elNombre = document.getElementById("nombre-jugador");
const elSaldo = document.getElementById("saldo");
const elAviso = document.getElementById("aviso");
const zonaQuiz = document.getElementById("zona-quiz");
const zonaFin = document.getElementById("zona-fin");
const zonaCarga = document.getElementById("zona-carga");
const elProgreso = document.getElementById("progreso");
const elTexto = document.getElementById("texto-pregunta");
const elOpciones = document.getElementById("opciones");
const elTextoFin = document.getElementById("texto-fin");

let preguntas = [];
let indiceActual = 0;

function mostrarAviso(texto, tipo = "") {
  elAviso.textContent = texto;
  elAviso.className = `aviso ${tipo}`.trim();
}

async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...opciones,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.codigo ?? "error");
  return data;
}

function pintarPregunta() {
  const p = preguntas[indiceActual];
  if (!p) return;
  elProgreso.textContent = `Pregunta ${indiceActual + 1} de ${preguntas.length}`;
  elTexto.textContent = p.texto;
  elOpciones.replaceChildren();
  p.opciones.forEach((texto, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = texto;
    btn.addEventListener("click", () => enviarRespuesta(i, btn));
    elOpciones.append(btn);
  });
}

async function enviarRespuesta(opcion, btn) {
  for (const b of elOpciones.querySelectorAll("button")) b.disabled = true;
  try {
    const data = await api("/api/responder", {
      method: "POST",
      body: JSON.stringify({ indice: indiceActual, opcion }),
    });
    elSaldo.textContent = String(data.saldo ?? elSaldo.textContent);
    mostrarAviso(data.aviso ?? "", data.correcta ? "ok" : "error");
    if (data.terminada) {
      zonaQuiz.hidden = true;
      zonaFin.hidden = false;
      elTextoFin.textContent = `Terminaste el quiz. Tu saldo quedó en ${data.saldo} sats simulados.`;
      return;
    }
    indiceActual = data.respondidas ?? indiceActual + 1;
    setTimeout(() => {
      pintarPregunta();
      for (const b of elOpciones.querySelectorAll("button")) b.disabled = false;
    }, 600);
  } catch (e) {
    mostrarAviso("No se pudo registrar la respuesta. Refrescá e intentá de nuevo.", "error");
    btn.disabled = false;
  }
}

async function iniciar() {
  if (nombre.length < 2) {
    window.location.href = "/";
    return;
  }
  if (elNombre) elNombre.textContent = nombre;
  try {
    await api("/api/sesion", { method: "POST", body: JSON.stringify({ nombre }) });
    const estado = await api("/api/estado");
    elSaldo.textContent = String(estado.saldo ?? 0);
    preguntas = estado.preguntas ?? [];
    indiceActual = estado.indiceActual ?? 0;
    zonaCarga.hidden = true;
    if (estado.terminada) {
      zonaFin.hidden = false;
      elTextoFin.textContent = `Ya cerraste esta partida. Saldo: ${estado.saldo} sats simulados.`;
      return;
    }
    zonaQuiz.hidden = false;
    pintarPregunta();
    if (estado.historial?.length) {
      mostrarAviso(`Tenés ${estado.historial.length} premios en el historial de esta cuenta.`, "ok");
    }
  } catch {
    mostrarAviso("No pudimos abrir tu sesión.", "error");
  }
}

iniciar();

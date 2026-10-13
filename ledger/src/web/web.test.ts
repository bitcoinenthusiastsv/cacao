import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { raizLedger } from "../datos.ts";
import { DIA_DEMO, MINUTO_CIERRE_DEMO, ejecutarDemo } from "../demo.ts";
import { clasificarCierre } from "../cierre.ts";
import { crearTicket } from "../ticket.ts";
import { AHORA } from "../ayudas-prueba.ts";
import { escapar } from "./escapar.ts";
import { paginaTicket, type DatosSitio } from "./paginas.ts";
import { generarSitio } from "./generar.ts";

const CLI = join(raizLedger(), "src", "cli.ts");
const INICIO = Date.parse("2026-10-12T18:00:00Z");

// Text as a reader sees it: tags become spaces, so labels and values do not run together.
function textoPlano(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

test("escaping turns the characters that open markup into text", () => {
  assert.equal(escapar('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(escapar("Pan & queso 'especial'"), "Pan &amp; queso &#39;especial&#39;");
  assert.equal(escapar("Café de altura"), "Café de altura", "accents pass through");
});

test("a ticket whose description holds a script tag shows it as text, and the page has no script", () => {
  const hostil = crearTicket(
    { cliente: "consumidor", lineas: [{ descripcion: "<script>alert(1)</script>", cantidad: 1, precioCentavos: 113 }] },
    AHORA,
    "TK-20261013-9001",
  );
  const datos: DatosSitio = {
    dia: "2026-10-13",
    informe: clasificarCierre({ fecha: "2026-10-13", ahora: AHORA, tickets: [hostil], atestaciones: [] }),
    tickets: new Map([[hostil.id, hostil]]),
    atestaciones: [],
    documentos: new Map(),
  };
  const html = paginaTicket(hostil, datos);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.doesNotMatch(html, /<script/i);
});

test("the demo day site: groups and totals, ticket pages, schema page, and every internal link resolves", () => {
  const trabajo = mkdtempSync(join(tmpdir(), "ledger-web-"));
  const datos = join(trabajo, "datos");
  const salida = join(trabajo, "sitio");
  try {
    assert.equal(ejecutarDemo("caso", { datos, silenciosa: true }), 0);
    const ahora = new Date(INICIO + MINUTO_CIERRE_DEMO * 60_000);
    const archivos = generarSitio({ datos, salida, dia: DIA_DEMO, ahora });
    assert.ok(archivos.length >= 4);

    const index = readFileSync(join(salida, "index.html"), "utf8");
    const texto = textoPlano(index);
    assert.ok(texto.includes("Emitidos (con sello simulado): 2 $9.04"), texto);
    assert.ok(texto.includes("Pagados sin documento válido (huérfanos): 3 $26.47"), texto);
    assert.ok(texto.includes("Con plazo de 24 horas corriendo: 1 $4.52"), texto);
    assert.ok(texto.includes("Abiertos (creados, sin pagar): 0"), texto);
    assert.ok(texto.includes("quedan 23 h"), "the time left comes first on the rejected line");
    assert.ok(texto.includes("No: 4 cobros sin documento válido."), "the answer line matches the terminal");

    const ids = [...index.matchAll(/href="tickets\/(TK-[0-9A-Z-]+)\.html"/g)].map((m) => m[1]);
    assert.equal(ids.length, 6, "one link per ticket of the close: two emitted, three orphans, one in its 24-hour fuse");
    for (const id of ids) assert.ok(existsSync(join(salida, "tickets", `${id}.html`)), `page for ${id}`);

    const emitido = readFileSync(join(salida, "tickets", `${ids[0]}.html`), "utf8");
    const t = textoPlano(emitido);
    assert.ok(emitido.includes("sello simulado"));
    assert.ok(t.includes("Validación de la copia guardada"));
    assert.ok(t.includes("Resultado VÁLIDO"));

    const esquemas = textoPlano(readFileSync(join(salida, "esquemas.html"), "utf8"));
    assert.ok(esquemas.includes("Dos generaciones de esquemas"));

    // Every page has no script, and every relative link and stylesheet points at an existing file.
    const paginas = readdirSync(salida, { recursive: true }).map(String).filter((f) => f.endsWith(".html"));
    assert.ok(paginas.length === 8, "index, schema page and six ticket pages");
    for (const p of paginas) {
      const html = readFileSync(join(salida, p), "utf8");
      assert.doesNotMatch(html, /<script/i, p);
      for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const destino = m[1] ?? "";
        if (/^(https?:|mailto:|#)/.test(destino)) continue;
        const archivo = resolve(dirname(join(salida, p)), destino.split(/[?#]/)[0] ?? "");
        assert.ok(existsSync(archivo) && statSync(archivo).isFile(), `${p} links to ${destino}`);
      }
    }

    // The cover command writes the same site from the same data.
    const cli = spawnSync(process.execPath, [CLI, "web", "--datos", datos, "--salida", join(trabajo, "otro"), "--dia", DIA_DEMO], {
      encoding: "utf8",
      env: { ...process.env, LEDGER_AHORA: ahora.toISOString() },
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /Sitio del cierre del 2026-10-12 escrito en/);
    assert.ok(existsSync(join(trabajo, "otro", "index.html")));
  } finally {
    rmSync(trabajo, { recursive: true, force: true });
  }
});

test("the stylesheet uses the Cacao colours as variables and has no shadows or gradients", () => {
  const css = readFileSync(join(raizLedger(), "src", "web", "estilo.css"), "utf8");
  for (const color of ["#F5EDE3", "#2A1912", "#D9902F", "#8C2F2B", "#5E3050", "#5A3221", "#E6D8C6", "#FFFAF4"]) {
    assert.ok(css.toUpperCase().includes(color), `color ${color}`);
  }
  assert.doesNotMatch(css, /(box|text)-shadow\s*:|gradient\(/i);
  assert.doesNotMatch(css, /@import|@font-face|fonts\.googleapis/i, "no web fonts: the site works offline");
});

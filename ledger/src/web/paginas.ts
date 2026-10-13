import type { Atestacion } from "../atestacion.ts";
import { GRUPOS, ETIQUETAS, montoFila, textoPlazo, type FilaCierre, type Grupo, type InformeCierre } from "../cierre.ts";
import { formatoSats, formatoUsd } from "../dinero.ts";
import { CONFIG, GENERACIONES, type Generacion } from "../generacion.ts";
import { fechaHoraSalvador } from "../tiempo.ts";
import { totalDeTicket, type Ticket } from "../ticket.ts";
import type { ResultadoValidacion } from "../validar.ts";
import { escapar } from "./escapar.ts";

// Pages of the static site. Pure: the generator reads the files and passes the data in.
// Every value that comes from a ticket or a document is escaped before it reaches the HTML.

export const OTROS_PRODUCTOS = [
  { nombre: "cacao", url: "https://cacao-grupo.vercel.app" },
  { nombre: "cacaomedia", url: "https://cacao-media.vercel.app" },
  { nombre: "cacaotravel", url: "https://cacao-travel.vercel.app" },
  { nombre: "cacaomarket", url: "https://cacao-market.vercel.app" },
  { nombre: "cacaopay", url: "https://cacao-pay.vercel.app" },
] as const;

export interface DocumentoSitio {
  // The stored document, as written by the builder.
  documento: Record<string, any>;
  generacion: Generacion;
  validacion: ResultadoValidacion;
}

export interface DatosSitio {
  dia: string;
  informe: InformeCierre;
  // Every ticket that appears in the close, by id.
  tickets: Map<string, Ticket>;
  // The whole chain in file order: the position of a record is its place in the chain.
  atestaciones: Atestacion[];
  // Stored documents, by ticket id, for the tickets that have one.
  documentos: Map<string, DocumentoSitio>;
}

const RUTA_TICKET = (id: string) => `tickets/${id}.html`;

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function dl(filas: [string, string][]): string {
  return `<dl class="datos">${filas.map(([t, v]) => `<div><dt>${escapar(t)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

// Text for the text values: escapes. Use for anything that is not already HTML.
function t(texto: string): string {
  return escapar(texto);
}

// Monospace span for numbers, codes and hashes. The value is escaped.
function cod(texto: string, clase = "num"): string {
  return `<span class="${clase}">${escapar(texto)}</span>`;
}

function pagina(titulo: string, prefijo: string, cuerpo: string): string {
  const enlaces = OTROS_PRODUCTOS.map((p) => `<li><a href="${p.url}">${escapar(p.nombre)}</a></li>`).join("");
  return `<!doctype html>
<html lang="es-SV">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} · cacaoledger</title>
<link rel="stylesheet" href="${prefijo}estilo.css">
</head>
<body>
<header class="cabecera">
<p class="marca"><a href="${prefijo}index.html">cacao<span>ledger</span></a></p>
<p class="lema">Cobrar y declarar</p>
<nav class="nav" aria-label="Secciones">
<a href="${prefijo}index.html">Cierre del día</a>
<a href="${prefijo}esquemas.html">Esquemas</a>
</nav>
</header>
<p class="cinta">Demostración: sello y transmisión simulados</p>
<main class="contenido">
${cuerpo}
</main>
<footer class="pie">
<p>Cacao, la empresa, y los otros productos</p>
<ul>${enlaces}</ul>
</footer>
</body>
</html>
`;
}

function filaDelCierre(f: FilaCierre): string {
  const plazo = textoPlazo(f);
  const partes = [
    plazo !== null ? `<span class="plazo">${t(plazo)}</span>` : "",
    `<a class="ticket" href="${RUTA_TICKET(f.ticket)}">${t(f.ticket)}</a>`,
    `<span class="fecha">${t(f.fecha)}</span>`,
    `<span class="monto">${t(montoFila(f))}</span>`,
    `<span class="motivo">${t(f.motivo)}</span>`,
  ];
  return `<li class="fila">${partes.filter((p) => p !== "").join(" ")}</li>`;
}

function seccionGrupo(g: Grupo, informe: InformeCierre): string {
  const tot = informe.totales[g];
  const cabecera = `${ETIQUETAS[g]}: <span class="num">${tot.cantidad}</span>${tot.cantidad > 0 ? ` <span class="num">${t(formatoUsd(tot.usdCentavos))}</span>` : ""}`;
  const filas = informe.grupos[g];
  const cuerpo = filas.length === 0 ? `<p class="vacio">Ninguno.</p>` : `<ul class="filas">${filas.map(filaDelCierre).join("")}</ul>`;
  return `<section class="grupo" aria-labelledby="grupo-${g}"><h2 id="grupo-${g}">${cabecera}</h2>${cuerpo}</section>`;
}

export function paginaIndice(d: DatosSitio): string {
  const i = d.informe;
  const cuerpo = `
<h1>Cierre del ${t(fechaCorta(i.fecha))}</h1>
<p class="nota">Cada ticket del día en un solo grupo. Hora de El Salvador.</p>
${GRUPOS.map((g) => seccionGrupo(g, i)).join("\n")}
<p class="respuesta" role="status">${t(i.respuesta)}</p>`;
  return pagina("Cierre del día", "", cuerpo);
}

// The reason a payment code was chosen, in words. Written for the merchant, not the schema.
export function razonFormaDePago(tipo: string, rail: "lightning" | "efectivo", codigo: string): string {
  if (rail === "efectivo") return "Pago en efectivo: billetes y monedas (01).";
  if (tipo === "03") return "Bitcoin (11): el comprobante de crédito fiscal lo admite en las dos generaciones.";
  if (codigo === "99") {
    return "Otros (99), con la referencia BTC-LN: el esquema caso no admite el 11 en la factura 01.";
  }
  if (codigo === "11") {
    return "Bitcoin (11): el esquema 2026 lo admite. La recepción del Ministerio no fue probada con este código.";
  }
  return `Código ${codigo} de CAT-017, tomado del medio de pago.`;
}

function lineasDelTicket(ticket: Ticket): string {
  return ticket.lineas
    .map((l) => {
      const importe = l.precioCentavos * l.cantidad;
      return `<li class="linea"><span class="desc">${t(l.descripcion)}</span> <span class="num">${l.cantidad} × ${formatoUsd(l.precioCentavos)} = ${formatoUsd(importe)}</span></li>`;
    })
    .join("");
}

function seccionPago(ticket: Ticket): string {
  const p = ticket.pago;
  if (!p) return `<section class="bloque"><h2>Pago</h2><p>Pendiente. El ticket todavía no tiene cobro.</p></section>`;
  const filas: [string, string][] = [
    ["Medio", p.rail === "lightning" ? "Lightning" : "Efectivo"],
    ["Monto", cod(formatoUsd(p.montoCentavos))],
    ["Momento", t(fechaHoraSalvador(new Date(p.momento)).fecEmi + " " + fechaHoraSalvador(new Date(p.momento)).horEmi)],
  ];
  if (p.rail === "lightning") {
    filas.splice(2, 0, ["Sats recibidos", cod(formatoSats(p.sats))]);
    filas.push(["Tasa", cod(`${p.tasaUsdPorBtc} USD/BTC`)]);
    filas.push(["Fuente de la tasa", t(p.tasaFuente)]);
    filas.push(["Hash del pago", cod(p.paymentHash, "hash")]);
  }
  return `<section class="bloque"><h2>Pago</h2>${dl(filas)}</section>`;
}

function seccionDocumento(ticket: Ticket, doc: DocumentoSitio | undefined): string {
  if (!ticket.dte || !doc) {
    const motivo =
      ticket.estado === "rechazado"
        ? "El documento fue rechazado y no tiene sello."
        : ticket.estado === "pagado"
          ? "Todavía no hay documento construido para este cobro."
          : "No hay documento: el ticket no está pagado.";
    return `<section class="bloque"><h2>Documento</h2><p>${t(motivo)}</p></section>`;
  }
  const d = doc.documento;
  const ident = d.identificacion ?? {};
  const pagoEmitido = (d.resumen?.pagos?.[0] ?? {}) as { codigo?: string; referencia?: string | null };
  const codigo = pagoEmitido.codigo ?? "";
  const tipo = String(ident.tipoDte ?? "");
  const rail = ticket.pago?.rail ?? "efectivo";
  const etiquetaTipo = tipo === "01" ? "01, factura de consumidor final" : "03, comprobante de crédito fiscal";
  const filas: [string, string][] = [
    ["Tipo", t(etiquetaTipo)],
    ["Número de control", cod(String(ident.numeroControl ?? ""))],
    ["Código de generación", cod(String(ident.codigoGeneracion ?? ""))],
    ["Ambiente", t(ident.ambiente === "01" ? "01, producción" : "00, prueba")],
    ["Emisión", t(`${String(ident.fecEmi ?? "")} ${String(ident.horEmi ?? "")}`)],
    ["Forma de pago emitida", cod(`${codigo}${pagoEmitido.referencia ? ` · ${pagoEmitido.referencia}` : ""}`)],
    ["Por qué", t(razonFormaDePago(tipo, rail, codigo))],
  ];
  let sello = "";
  if (ticket.sello) {
    sello = `<p class="sello"><span class="chip chip-simulado">sello simulado</span> ${cod(ticket.sello.valor)}</p>`;
  } else if (ticket.rechazo) {
    sello = `<p class="rechazo">Rechazado el ${t(fechaHoraSalvador(new Date(ticket.rechazo.momento)).fecEmi)}. Observaciones:</p><ul>${ticket.rechazo.observaciones.map((o) => `<li>${t(o)}</li>`).join("")}</ul>`;
  }
  return `<section class="bloque"><h2>Documento</h2>${dl(filas)}${sello}</section>`;
}

function seccionAtestacion(ticket: Ticket, atestaciones: Atestacion[]): string {
  if (ticket.pago?.rail !== "lightning") return "";
  const indice = atestaciones.findIndex((a) => a.ticket === ticket.id);
  if (indice < 0) {
    return `<section class="bloque"><h2>Atestación de tasa</h2><p>Sin atestación: el documento no se ha construido. Mientras tanto, los sats son los del pago.</p></section>`;
  }
  const a = atestaciones[indice] as Atestacion;
  const anterior = a.anterior === "0".repeat(64) ? "inicio de la cadena (64 ceros)" : a.anterior;
  const filas: [string, string][] = [
    ["Registro", cod(a.hash, "hash")],
    ["Hash del registro anterior", cod(anterior, "hash")],
    ["Posición en la cadena", t(`registro ${indice + 1} de ${atestaciones.length}`)],
    ["Sats", cod(formatoSats(a.sats))],
    ["Monto en dólares", cod(formatoUsd(a.usdCentavos))],
    ["Tasa", cod(`${a.tasaUsdPorBtc} USD/BTC`)],
    ["Fuente de la tasa", t(a.tasaFuente)],
    ["Momento del pago", t(a.momentoPago)],
  ];
  return `<section class="bloque"><h2>Atestación de tasa</h2>${dl(filas)}<p class="nota">Cada registro lleva el hash del anterior. Si uno cambia, la cadena se rompe en ese punto.</p></section>`;
}

function seccionValidacion(doc: DocumentoSitio | undefined): string {
  if (!doc) return "";
  const v = doc.validacion;
  const fallos = [...v.esquema, ...v.reglas];
  const lista = fallos.length === 0 ? "" : `<ul>${fallos.map((f) => `<li>${t(f.ruta)}: ${t(f.mensaje)} <span class="num">(${t(f.valor)})</span></li>`).join("")}</ul>`;
  const avisos = v.avisos.map((a) => `<p class="aviso">${t(a)}</p>`).join("");
  return `<section class="bloque"><h2>Validación</h2>
${dl([
    ["Generación de esquemas", t(doc.generacion)],
    ["Esquema usado", cod(v.archivoEsquema ?? "sin esquema")],
    ["Origen del esquema", t(v.origenEsquema ?? "")],
    ["Resultado", t(v.ok ? "VÁLIDO" : "NO VÁLIDO")],
  ])}
${lista}${avisos}
<p class="nota">Validación de la copia guardada, con las mismas reglas que usa la recepción simulada.</p>
</section>`;
}

export function paginaTicket(ticket: Ticket, d: DatosSitio): string {
  const total = totalDeTicket(ticket);
  const fecha = fechaHoraSalvador(new Date(ticket.creado));
  const cliente = ticket.cliente === "consumidor" ? "consumidor final (01)" : "contribuyente (03)";
  const filasCliente: [string, string][] = [
    ["Cliente", t(cliente)],
    ["Creado", t(`${fecha.fecEmi} ${fecha.horEmi}`)],
    ["Estado", `<span class="chip chip-${ticket.estado}">${t(ticket.estado)}</span>`],
  ];
  if (ticket.origen) {
    filasCliente.push(["Pedido de CacaoMarket", cod(ticket.origen.numero)]);
  }
  if (ticket.receptor) {
    filasCliente.push(["Receptor", t(ticket.receptor.nombre)], ["NIT del receptor", cod(ticket.receptor.nit)], ["NRC del receptor", cod(ticket.receptor.nrc)]);
  }
  const bloqueTotales =
    ticket.cliente === "consumidor"
      ? dl([
          ["Total con IVA incluido", cod(formatoUsd(total.totalCentavos))],
          ["IVA contenido (13/113)", cod(formatoUsd(total.ivaCentavos))],
          ["Neto", cod(formatoUsd(total.netoCentavos))],
        ])
      : dl([
          ["Subtotal sin IVA", cod(formatoUsd(total.gravadoCentavos))],
          ["IVA 13 %", cod(formatoUsd(total.ivaCentavos))],
          ["Total a pagar", cod(formatoUsd(total.totalCentavos))],
        ]);
  const doc = d.documentos.get(ticket.id);
  const cuerpo = `
<p class="volver"><a href="../index.html">Volver al cierre del día</a></p>
<h1>Ticket <span class="num">${t(ticket.id)}</span></h1>
<section class="bloque"><h2>Datos</h2>${dl(filasCliente)}</section>
<section class="bloque"><h2>Líneas</h2><ul class="lineas">${lineasDelTicket(ticket)}</ul>${bloqueTotales}</section>
${seccionPago(ticket)}
${seccionDocumento(ticket, doc)}
${seccionAtestacion(ticket, d.atestaciones)}
${seccionValidacion(doc)}`;
  return pagina(`Ticket ${ticket.id}`, "../", cuerpo);
}

export function paginaEsquemas(): string {
  const filas = GENERACIONES.map((g) => {
    const c = CONFIG[g];
    return `<div><dt>${t(g)}</dt><dd>01 versión ${c.version["01"]}: <span class="num">${t(c.esquema["01"])}</span><br>03 versión ${c.version["03"]}: <span class="num">${t(c.esquema["03"])}</span><br>${t(c.origen)}</dd></div>`;
  }).join("");
  const cuerpo = `
<h1>Dos generaciones de esquemas</h1>
<p>El Ministerio publica un esquema JSON para cada documento. CacaoLedger construye y valida con dos generaciones, y cada documento lleva en su versión la generación que usó.</p>
<p>La generación <strong>caso</strong> viene de una copia de un repositorio comunitario, no del Ministerio. En su factura 01 el patrón de forma de pago no admite el 11 (Bitcoin), así que un cobro Lightning se emite como 99 (Otros) con la referencia BTC-LN.</p>
<p>La generación <strong>2026</strong> es el paquete que el Ministerio publica hoy. Ahí el 11 ya está permitido en la factura 01; CacaoLedger lo emite con un aviso, porque la recepción del Ministerio no se pudo probar con ese código.</p>
<p>Además, la reforma municipal cambió los códigos de municipio y los esquemas caso no aceptan la lista vigente.</p>
<section class="bloque"><h2>Archivos</h2><dl class="datos">${filas}</dl></section>`;
  return pagina("Esquemas", "", cuerpo);
}

// All pages of the site, by path relative to the site folder.
export function paginasDelSitio(d: DatosSitio): Map<string, string> {
  const paginas = new Map<string, string>();
  paginas.set("index.html", paginaIndice(d));
  paginas.set("esquemas.html", paginaEsquemas());
  for (const [id, ticket] of d.tickets) {
    paginas.set(RUTA_TICKET(id), paginaTicket(ticket, d));
  }
  return paginas;
}

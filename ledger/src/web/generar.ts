import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { leerAtestaciones } from "../atestacion.ts";
import { clasificarCierre, GRUPOS } from "../cierre.ts";
import { leerJson } from "../datos.ts";
import { generacionDeDocumento, resolverGeneracion } from "../generacion.ts";
import { escribirLibrosCsv, informeMes, leerDocumentosEmitidos } from "../mes.ts";
import { listarTickets, type Ticket } from "../ticket.ts";
import { validarDte } from "../validar.ts";
import { paginasDelSitio, type DatosSitio, type DocumentoSitio } from "./paginas.ts";

// Writes the static site of the daily close. Reads the data folder, checks every stored
// document with the schema generation it was built with, and writes plain HTML and one CSS file.

export interface OpcionesSitio {
  datos: string;
  salida: string;
  dia: string; // YYYY-MM-DD
  ahora: Date; // for the 24-hour fuses
}

const CSS = fileURLToPath(new URL("./estilo.css", import.meta.url));

export function generarSitio(o: OpcionesSitio): string[] {
  const tickets = listarTickets(o.datos);
  const atestaciones = leerAtestaciones(o.datos);
  const informe = clasificarCierre({ fecha: o.dia, ahora: o.ahora, tickets, atestaciones });
  const mes = o.dia.slice(0, 7);
  const docsEmitidos = leerDocumentosEmitidos(o.datos, tickets);
  const mesInforme = informeMes(mes, docsEmitidos, tickets);

  // Only the tickets that appear in the close get a page.
  const enCierre = new Map<string, Ticket>();
  const porId = new Map(tickets.map((t) => [t.id, t] as const));
  for (const g of GRUPOS) {
    for (const f of informe.grupos[g]) {
      const ticket = porId.get(f.ticket);
      if (ticket) enCierre.set(ticket.id, ticket);
    }
  }

  const documentos = new Map<string, DocumentoSitio>();
  for (const ticket of enCierre.values()) {
    if (!ticket.dte) continue;
    const doc = leerJson(join(o.datos, ticket.dte.archivo)) as Record<string, any>;
    const generacion = generacionDeDocumento(doc) ?? resolverGeneracion(undefined);
    // Same rule as the reception: production is refused unless it was confirmed when it was built.
    const validacion = validarDte(doc, { generacion, permitirProduccion: false });
    documentos.set(ticket.id, { documento: doc, generacion, validacion });
  }

  const datos: DatosSitio = { dia: o.dia, informe, informeMes: mesInforme, tickets: enCierre, atestaciones, documentos };
  rmSync(join(o.salida, "tickets"), { recursive: true, force: true });
  rmSync(join(o.salida, "csv"), { recursive: true, force: true });
  const escritos: string[] = [];
  for (const [ruta, html] of paginasDelSitio(datos)) {
    const absoluta = join(o.salida, ruta);
    mkdirSync(dirname(absoluta), { recursive: true });
    writeFileSync(absoluta, html, "utf8");
    escritos.push(absoluta);
  }
  for (const csvRuta of escribirLibrosCsv(join(o.salida, "csv"), mesInforme)) {
    escritos.push(csvRuta);
  }
  const estilo = join(o.salida, "estilo.css");
  mkdirSync(o.salida, { recursive: true });
  writeFileSync(estilo, readFileSync(CSS, "utf8"), "utf8");
  escritos.push(estilo);
  return escritos;
}

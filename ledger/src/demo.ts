import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { raizLedger } from "./datos.ts";
import { resolverGeneracion, CONFIG, type Generacion } from "./generacion.ts";

// The whole story in one command, from fixtures, in a temporary data folder. The clock and the
// seed are fixed, so the output is the same on every run. Each step runs the real CLI.

const CLI = join(raizLedger(), "src", "cli.ts");
const SEMILLA = "demostracion";
export const DIA_DEMO = "2026-10-12";
const INICIO = Date.parse("2026-10-12T18:00:00Z"); // 12:00 in El Salvador
// The close and the month export run at this minute of the demo.
export const MINUTO_CIERRE_DEMO = 60;

export interface OpcionesDemo {
  // Keep the data in this folder instead of a temporary one. The folder is not removed.
  datos?: string;
  // Print nothing. Used by npm run sitio.
  silenciosa?: boolean;
}

interface Paso {
  args: string[];
}

function ejecutar(gen: Generacion, tmp: string, datos: string, paso: Paso, minutos: number) {
  const instante = new Date(INICIO + minutos * 60_000).toISOString();
  const r = spawnSync(process.execPath, [CLI, ...paso.args, "--datos", datos], {
    cwd: raizLedger(),
    encoding: "utf8",
    env: { ...process.env, LEDGER_AHORA: instante, LEDGER_SEMILLA: SEMILLA, LEDGER_ESQUEMAS: gen },
  });
  return { codigo: r.status ?? 1, salida: limpiar(`${r.stdout}${r.stderr}`, tmp) };
}

function limpiar(texto: string, tmp: string): string {
  return texto.split(tmp).join("<carpeta temporal>").split(tmp.replace(/\\/g, "/")).join("<carpeta temporal>");
}

function idDe(salida: string): string {
  const m = /TK-\d{8}-[0-9A-F]{4}/.exec(salida);
  if (!m) throw new Error("La demostración no encontró el identificador del ticket.");
  return m[0];
}

// The stored file name of a ticket's document, read from the ticket.
function dteArchivo(datos: string, id: string): string {
  const ticket = JSON.parse(readFileSync(join(datos, "tickets", `${id}.json`), "utf8")) as { dte: { archivo: string } };
  return ticket.dte.archivo.replace(/^dte\//, "");
}

export function ejecutarDemo(valor?: string, opciones: OpcionesDemo = {}): number {
  const gen = resolverGeneracion(valor);
  const config = CONFIG[gen];
  const escribir = (s: string) => {
    if (!opciones.silenciosa) process.stdout.write(s);
  };
  const encabezado = (n: number, titulo: string, comando: string) => escribir(`\n${n}. ${titulo}\n   $ ledger ${comando}\n`);
  const bloque = (texto: string) => {
    for (const linea of texto.replace(/\n$/, "").split("\n")) escribir(`   ${linea}\n`);
  };
  const nota = (texto: string) => escribir(`   ${texto}\n`);

  const tmp = mkdtempSync(join(tmpdir(), "ledger-demo-"));
  const datos = opciones.datos ?? join(tmp, "datos");
  mkdirSync(datos, { recursive: true });
  const fixtureContribuyente = gen === "caso" ? "fixtures/caso/ticket-contribuyente.json" : "fixtures/ticket-contribuyente.json";
  let n = 0;
  let fallos = 0;
  const run = (titulo: string, args: string[], minutos: number, mostrarComando = args.join(" "), carpeta = datos) => {
    n += 1;
    encabezado(n, titulo, mostrarComando);
    const r = ejecutar(gen, tmp, carpeta, { args }, minutos);
    bloque(r.salida);
    return r;
  };

  try {
    escribir(`CacaoLedger · demostración · esquemas ${gen}\n`);
    nota(`Esquema de 01: ${config.esquema["01"]} (${config.origen}).`);
    nota(`Esquema de 03: ${config.esquema["03"]}.`);
    if (gen === "caso") {
      nota("Municipios del caso: códigos anteriores a la reforma municipal, tomados de un paquete npm de terceros; no comprobados contra el catálogo del Ministerio.");
    }
    nota("Datos en una carpeta temporal que se borra al terminar. Reloj fijo, sin red, sin cuentas.");

    const a = run("Crear un ticket de consumidor final (factura 01)", ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor.json"], 0);
    const idA = idDe(a.salida);
    const b = run("Crear un ticket de contribuyente (comprobante 03)", ["ticket", "nuevo", "--desde", fixtureContribuyente], 1);
    const idB = idDe(b.salida);

    run("Pagar el ticket de consumidor por Lightning (webhook de Blink)", ["pagar", idA, "--blink", "fixtures/blink-receive-lightning.json"], 2);
    run("Pagar el ticket de contribuyente en efectivo", ["pagar", idB, "--efectivo"], 3);

    run("Construir la factura 01 del pago Lightning", ["dte", "construir", idA, "--esquemas", gen], 4);
    if (gen === "caso") {
      nota("En el esquema caso la forma de pago es 99 (Otros) con la referencia BTC-LN: el código 11 no lo admite la factura 01.");
    } else {
      nota("En el esquema 2026 la forma de pago es 11 (Bitcoin): el esquema ya lo permite. La recepción del Ministerio no fue probada.");
    }

    // Build the same 01 with code 11 in a copy of the stored file, to show what the validator says.
    const dteA = JSON.parse(readFileSync(join(datos, "dte", dteArchivo(datos, idA)), "utf8")) as { resumen: { pagos: { codigo: string }[] } };
    const pagoA = dteA.resumen.pagos[0];
    if (pagoA) pagoA.codigo = "11";
    const forzado = join(tmp, "factura-01-codigo-11.json");
    writeFileSync(forzado, `${JSON.stringify(dteA, null, 2)}\n`, "utf8");
    run("Forzar el código 11 (Bitcoin) en la factura 01 y validar el archivo", ["dte", "validar", forzado, "--esquemas", gen], 5, `dte validar <copia de la factura con código 11> --esquemas ${gen}`);
    if (gen === "caso") {
      nota("Falla en la capa del esquema: el patrón de forma de pago de la factura 01 v1 no admite 11, y CacaoLedger lo rechaza también.");
    } else {
      nota("Pasa el esquema 2026 y queda un aviso: la recepción del Ministerio no fue probada con este código.");
    }

    run("Construir el comprobante 03 de la venta en efectivo", ["dte", "construir", idB, "--esquemas", gen], 6);

    run("Transmitir la factura 01 al servicio de recepción simulado", ["dte", "transmitir", idA, "--simulado"], 7);
    run("Transmitir el comprobante 03 al servicio de recepción simulado", ["dte", "transmitir", idB, "--simulado"], 8);

    run("Ver el ticket emitido, con su sello simulado", ["ticket", "ver", idA], 9);
    run("Ver la atestación de tasa de la factura Lightning", ["atestacion", "ver", idA], 9);
    run("Verificar la cadena de atestaciones", ["atestacion", "verificar"], 10);

    // A pedido exported from CacaoMarket, paid by Lightning: imported, then its 01 is built.
    const m = run("Importar el pedido 1042 de CacaoMarket (pagado por Lightning)", ["importar", "market", "fixtures/market-orden-1042.json"], 25);
    const idM = idDe(m.salida);
    run("Construir la factura 01 del pedido importado", ["dte", "construir", idM, "--esquemas", gen], 26);
    run("Ver la atestación de tasa del pedido importado", ["atestacion", "ver", idM], 26);

    // A sale paid in cash with no document: money received, nothing built.
    const c = run("Una venta pagada en efectivo sin documento (huérfana)", ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor.json"], 27);
    const idC = idDe(c.salida);
    run("Pagarla en efectivo; no se construye su documento", ["pagar", idC, "--efectivo"], 28);

    // A Lightning payment with no document: the sats come from the payment, and there is no attestation yet.
    const p = run("Una venta pagada por Lightning sin documento (huérfana)", ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor-pupusas.json"], 29);
    const idP = idDe(p.salida);
    run("Pagarla por Lightning; no se construye su documento", ["pagar", idP, "--blink", "fixtures/blink-receive-lightning-pupusas.json"], 30);
    nota("Sin documento no hay atestación: la atestación se escribe al construir el 01. Hasta entonces, los sats vienen del pago de Blink.");

    // A document that the reception refuses: a production document sent to the test service.
    const d = run("Una venta en efectivo cuyo documento de producción no se acepta en la prueba", ["ticket", "nuevo", "--desde", "fixtures/ticket-consumidor.json"], 31);
    const idD = idDe(d.salida);
    run("Pagarla en efectivo", ["pagar", idD, "--efectivo"], 32);
    run("Construir su factura con ambiente de producción", ["dte", "construir", idD, "--ambiente", "01", "--confirmar-produccion", "--esquemas", gen], 33);
    const rechazo = run("Transmitir: el servicio de prueba rechaza el documento de producción", ["dte", "transmitir", idD, "--simulado"], 34);
    if (rechazo.codigo === 0) fallos += 1;
    nota("El rechazo abre 24 horas para reenviar el documento. El cierre diario lo muestra.");

    // Tamper with a copy of the chain: the real file stays intact for the close.
    const copia = join(tmp, "copia");
    mkdirSync(copia, { recursive: true });
    const original = join(datos, "atestaciones.jsonl");
    const destino = join(copia, "atestaciones.jsonl");
    copyFileSync(original, destino);
    const lineas = readFileSync(destino, "utf8").split("\n");
    lineas[0] = (lineas[0] ?? "").replace('"sats":12236', '"sats":12200');
    writeFileSync(destino, lineas.join("\n"), "utf8");
    run("Alterar un solo número en una copia de la cadena y verificarla", ["atestacion", "verificar"], 35, "atestacion verificar  (sobre una copia alterada)", copia);

    const cierre = run("Cierre diario del día: cada cobro en un solo grupo", ["cierre", DIA_DEMO], MINUTO_CIERRE_DEMO);
    if (cierre.codigo === 0) nota("El cierre salió con código 0.");
    else nota(`El cierre salió con código ${cierre.codigo}: hay cobros sin documento válido, como se esperaba en esta demostración.`);

    run("Libros de IVA y cifras del mes", ["mes", DIA_DEMO.slice(0, 7)], MINUTO_CIERRE_DEMO);
    nota("Los libros salen de los documentos con sello. Los pedidos sin documento válido aparecen en No incluidos.");

    escribir("\nFin de la demostración.\n");
    return fallos === 0 ? 0 : 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

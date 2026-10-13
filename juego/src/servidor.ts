import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { AlmacenJuego } from "./almacen.ts";
import { leerRecurso } from "./recursos.ts";
import { manejarApi } from "./api.ts";
import {
  paginaAdmin,
  paginaInicio,
  paginaJugar,
  paginaTabla,
} from "./web/paginas.ts";

const PUERTO = Number(process.env.CACAO_JUEGO_PUERTO ?? 4325);

export function crearServidor(almacen = new AlmacenJuego()) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const ruta = url.pathname;

      if (await manejarApi(req, res, ruta, { almacen })) return;

      if (ruta === "/static/jugar.mjs") {
        const contenido = leerRecurso("jugar.mjs", import.meta.url);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.end(contenido);
        return;
      }

      let html: string;
      if (ruta === "/" || ruta === "/index.html") {
        html = paginaInicio();
      } else if (ruta === "/jugar") {
        const nombre = url.searchParams.get("nombre") ?? "";
        html = paginaJugar(nombre);
      } else if (ruta === "/tabla") {
        html = paginaTabla(almacen.tablaPosiciones());
      } else if (ruta === "/admin") {
        if (process.env.VERCEL && !process.env.CACAO_JUEGO_ADMIN) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("No encontrado\n");
          return;
        }
        const snap = almacen.snapshot();
        const satsOtorgados = snap.historial.reduce((s, h) => s + h.sats, 0);
        const nombres = new Map(snap.jugadores.map((j) => [j.id, j.nombre]));
        html = paginaAdmin({
          jugadores: snap.jugadores.length,
          partidas: snap.partidas.length,
          satsOtorgados,
          ultimos: [...snap.historial].sort((a, b) => b.cuando.localeCompare(a.cuando)).slice(0, 15),
          nombres,
        });
      } else {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("No encontrado\n");
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Error interno\n");
      console.error(err);
    }
  });
}

const esPrincipal =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esPrincipal) {
  const servidor = crearServidor();
  servidor.listen(PUERTO, () => {
    process.stdout.write(`Cacao Juego escuchando en http://localhost:${PUERTO}\n`);
  });
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { crearServidor } from "../src/servidor.ts";

const servidor = crearServidor();

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    res.on("finish", () => resolve());
    res.on("close", () => resolve());
    servidor.emit("request", req, res);
  });
}

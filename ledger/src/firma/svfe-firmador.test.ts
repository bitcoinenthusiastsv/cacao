import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { extraerJwsDeRespuesta, firmarDocumentoSvfe } from "./svfe-firmador.ts";

const JWS = "eyJhbGciOiJSUzI1NiJ9.eyJ0eXAiOiJKV1QifQ.firma-prueba-local";

function servidorFalso(respuesta: unknown, status = 200): Promise<{ url: string; cerrar: () => void }> {
  return new Promise((resolve, reject) => {
    const srv: Server = createServer((req, res) => {
      if (req.method === "POST" && req.url?.includes("firmardocumento")) {
        let cuerpo = "";
        req.on("data", (c) => {
          cuerpo += c;
        });
        req.on("end", () => {
          const parsed = JSON.parse(cuerpo) as { nit: string; passwordPri: string; dteJson: unknown };
          assert.equal(parsed.nit, "06141901010013");
          assert.ok(parsed.passwordPri.length >= 8);
          assert.ok(typeof parsed.dteJson === "object");
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(respuesta));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/firma/firmardocumento/`,
        cerrar: () => srv.close(),
      });
    });
  });
}

test("extracts JWS from typical firmador JSON shapes", () => {
  assert.equal(extraerJwsDeRespuesta({ body: JWS }), JWS);
  assert.equal(extraerJwsDeRespuesta({ documento: JWS }), JWS);
  assert.equal(extraerJwsDeRespuesta(JWS), JWS);
});

test("POST sends nit, passwordPri and dteJson and returns the JWS", async () => {
  const fake = await servidorFalso({ body: JWS });
  try {
    const jws = await firmarDocumentoSvfe(
      fake.url,
      { nit: "06141901010013", passwordPri: "password-123456", dteJson: { identificacion: { tipoDte: "01" } } },
    );
    assert.equal(jws, JWS);
  } finally {
    fake.cerrar();
  }
});

test("when the firmador is down the error mentions simulated transmission", async () => {
  await assert.rejects(
    () =>
      firmarDocumentoSvfe("http://127.0.0.1:1/firma/firmardocumento/", {
        nit: "06141901010013",
        passwordPri: "password-123456",
        dteJson: {},
      }),
    /dte transmitir --simulado/,
  );
});

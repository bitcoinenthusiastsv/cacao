import { test } from "node:test";
import assert from "node:assert/strict";
import { generacionDeDocumento, resolverGeneracion, CONFIG } from "./generacion.ts";

test("the default generation is caso, and LEDGER_ESQUEMAS or an explicit value replaces it", () => {
  const previo = process.env.LEDGER_ESQUEMAS;
  try {
    delete process.env.LEDGER_ESQUEMAS;
    assert.equal(resolverGeneracion(), "caso");
    process.env.LEDGER_ESQUEMAS = "2026";
    assert.equal(resolverGeneracion(), "2026");
    assert.equal(resolverGeneracion("caso"), "caso", "the explicit value wins over the environment");
  } finally {
    if (previo === undefined) delete process.env.LEDGER_ESQUEMAS;
    else process.env.LEDGER_ESQUEMAS = previo;
  }
});

test("an unknown generation is refused in one sentence", () => {
  assert.throws(() => resolverGeneracion("2025"), /debe ser "caso" o "2026"/);
});

test("each generation names its own version constants and schema files", () => {
  assert.deepEqual(CONFIG.caso.version, { "01": 1, "03": 3 });
  assert.deepEqual(CONFIG["2026"].version, { "01": 2, "03": 4 });
  assert.equal(CONFIG.caso.esquema["01"], "espejo-herson/DTE-FE-v1.json");
  assert.equal(CONFIG.caso.esquema["03"], "espejo-herson/DTE-CCFE-v3.json");
  assert.equal(CONFIG["2026"].esquema["01"], "ministerio-2026/fe-f-v2.json");
  assert.equal(CONFIG["2026"].esquema["03"], "ministerio-2026/fe-ccf-v4.json");
});

test("a document reports its own generation from identificacion.version", () => {
  assert.equal(generacionDeDocumento({ identificacion: { version: 1 } }), "caso");
  assert.equal(generacionDeDocumento({ identificacion: { version: 3 } }), "caso");
  assert.equal(generacionDeDocumento({ identificacion: { version: 2 } }), "2026");
  assert.equal(generacionDeDocumento({ identificacion: { version: 4 } }), "2026");
  assert.equal(generacionDeDocumento({ identificacion: { version: 9 } }), null);
});

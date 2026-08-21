import assert from "node:assert/strict";
import test from "node:test";

import { EXAMPLES } from "../../../website/live/examples.mjs";
import { createSage } from "../node-kernel.mjs";

test("every live dropdown example executes verbatim in production Node-Wasm", async (t) => {
  const expected = new Set([
    "number-field",
    "elliptic-lseries",
    "complex-plot",
    "exact-matrices",
    "modular-symbols",
    "random-graph-plot",
    "graph-automorphisms",
  ]);
  assert.deepEqual(new Set(EXAMPLES.map(({ id }) => id)), expected);

  for (const example of EXAMPLES) {
    await t.test(example.id, { timeout: 180_000 }, async () => {
      const sage = await createSage();
      try {
        const result = await sage.evaluate(example.source, { timeout: 150_000 });
        assert.equal(typeof result.repr, "string");
        if (example.id === "complex-plot" || example.id === "random-graph-plot") {
          assert.equal(result.display?.mime, "application/vnd.plotly.v1+json");
        }
      } finally {
        await sage.close();
      }
    });
  }
});

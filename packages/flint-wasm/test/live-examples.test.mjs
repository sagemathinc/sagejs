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
    "numpy-signal-recovery",
    "modular-symbols",
    "python-language",
    "magma-language",
    "mathematica-language",
    "matlab-language",
    "maple-language",
    "macaulay2-language",
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
        if (example.id === "numpy-signal-recovery") {
          assert.equal(
            result.stdout,
            [
              "dominant frequency bins: [19, 7]",
              "recovered coefficients: [1.721, -0.011, -0.007, 0.892]",
              "fit RMSE: 0.018268",
              "",
            ].join("\n"),
          );
          assert.ok(
            result.instrumentation.routes.some(
              (route) =>
                route.capability_id === "specialist:numpy-ts" &&
                route.selected === true,
            ),
            JSON.stringify(result.instrumentation),
          );
        }
      } finally {
        await sage.close();
      }
    });
  }
});

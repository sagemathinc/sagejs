import assert from "node:assert/strict";
import test from "node:test";
import { createSage } from "../node-kernel.mjs";
import { modularAbelianVarietyCase } from "./public-gap-closure-support.mjs";

test("packaged Wasm loads abelian varieties and preserves canonical maps", async (t) => {
  const sage = await createSage({ timeout: 120_000 });
  t.after(() => sage.close());
  const result = await sage.evaluate(modularAbelianVarietyCase.source);
  assert.equal(result.repr, modularAbelianVarietyCase.expected);
  // Keep the invalid-map program self-contained: this regression checks the
  // codec contract, independently of cross-evaluation namespace handling.
  await assert.rejects(sage.evaluate([
    modularAbelianVarietyCase.source,
    "from sagejs.modular_abelian_varieties import ModularAbelianVarietyMap",
    "bad=ModularAbelianVarietyMap(J,A,2*q.matrix(),'doubled quotient')",
    "dumps(bad)",
  ].join("\n")),
    /only canonical homology maps.*matrix differs/);
});

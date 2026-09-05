import assert from "node:assert/strict";
import test from "node:test";
import { createSage } from "../node-kernel.mjs";
import { modularAbelianVarietyCase } from "./public-gap-closure-support.mjs";

test("packaged Wasm loads abelian varieties and preserves canonical maps", async (t) => {
  const sage = await createSage({ timeout: 120_000 });
  t.after(() => sage.close());
  const result = await sage.evaluate(modularAbelianVarietyCase.source);
  assert.equal(result.repr, modularAbelianVarietyCase.expected);
  await sage.evaluate([
    "from sagejs.modular_abelian_varieties import ModularAbelianVarietyMap",
    "bad=ModularAbelianVarietyMap(J,A,2*q.matrix(),'doubled quotient')",
  ].join("\n"));
  await assert.rejects(sage.evaluate("dumps(bad)"),
    /only canonical homology maps.*matrix differs/);
});

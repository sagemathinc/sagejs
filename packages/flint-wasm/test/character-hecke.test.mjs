import assert from "node:assert/strict";
import test from "node:test";
import { createSage } from "../node-kernel.mjs";
import { publicGapCases } from "./public-gap-closure-support.mjs";
import { characterHeckeCases } from "./character-hecke-support.mjs";

test("portable character Hecke and Gamma1 cusp/newforms run in Wasm", async () => {
  const sage = await createSage({ timeout: 120000 });
  try {
    for (const item of [publicGapCases[1], ...characterHeckeCases]) {
      const result = await sage.evaluate(item.source);
      assert.equal(result.repr, item.expected, item.name);
    }
  } finally {
    await sage.close();
  }
});

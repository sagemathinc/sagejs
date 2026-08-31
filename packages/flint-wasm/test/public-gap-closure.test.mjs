import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";
import { publicGapCases } from "./public-gap-closure-support.mjs";

test("public Wasm closes the advanced exact and numerical fallback gaps", async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    for (const { name, source, expected } of publicGapCases) {
      const result = await sage.evaluate(source);
      assert.equal(result.repr, expected, name);
    }
  } finally {
    await sage.close();
  }
});

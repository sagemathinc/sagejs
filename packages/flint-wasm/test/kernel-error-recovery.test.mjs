import test from "node:test";
import assert from "node:assert/strict";
import { createSage } from "../node-kernel.mjs";

test("a rejected evaluation does not kill the Wasm kernel worker", { timeout: 60000 }, async () => {
  const sage = await createSage();
  try {
    for (const source of [
      "raise ValueError('expected recoverable error')",
      "sagejs_missing_name_for_recovery_test",
    ]) {
      await assert.rejects(sage.evaluate(source, { timeout: 10000 }));
      const next = await sage.evaluate("2+2", { timeout: 10000 });
      assert.equal(next.repr, "4");
    }
  } finally {
    await sage.close();
  }
});

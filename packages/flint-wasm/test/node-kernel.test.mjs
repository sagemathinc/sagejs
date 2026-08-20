import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

test("the Node host runs the isolated WebAssembly Sage kernel", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      "print(factor(2026))",
    );
    assert.equal(result.stdout, "2 * 1013\n");
    assert.ok(
      result.instrumentation.routes.some(
        (route) => route.execution_target === "wasm-artifact",
      ),
    );
  } finally {
    await session.close();
  }
});

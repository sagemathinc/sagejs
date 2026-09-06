import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";
import { publicGapCases } from "./public-gap-closure-support.mjs";

test("public Wasm validates supported workflows and explicit capability limits", async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    for (const { name, source, expected, expectedError } of publicGapCases) {
      if (expectedError) {
        await assert.rejects(
          sage.evaluate(source),
          (error) => error.message.includes(expectedError),
          name,
        );
        continue;
      }
      const result = await sage.evaluate(source);
      assert.equal(result.repr, expected, name);
    }
  } finally {
    await sage.close();
  }
});

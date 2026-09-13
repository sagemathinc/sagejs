import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSage } from "../node-kernel.mjs";

test("production Wasm respects extension field capability boundaries", { timeout: 120000 }, async () => {
  const sage = await createSage();
  try {
    const result = await sage.evaluate(await readFile(new URL(
      "../../../test/extension-field-capabilities.py", import.meta.url,
    ), "utf8"));
    assert.match(result.stdout, /extension-field capability boundaries passed/);
    const target = await sage.evaluate(
      "from sagejs.polynomial_algorithms.field_capabilities import field_capability\n" +
      "print(field_capability(QQ, 'ideal')['execution_target'])",
    );
    assert.match(target.stdout, /wasm/);
  } finally {
    await sage.close();
  }
});

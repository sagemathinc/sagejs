import test from "node:test";
import { readFile } from "node:fs/promises";
import { createSage } from "../node-kernel.mjs";

test("Wasm finite fields enumerate nonprimitive presentations exactly", { timeout: 120_000 }, async () => {
  const sage = await createSage();
  try {
    const source = await readFile(new URL("../../../test/extension-field-enumeration.py", import.meta.url), "utf8");
    await sage.evaluate(source);
  } finally {
    await sage.close();
  }
});

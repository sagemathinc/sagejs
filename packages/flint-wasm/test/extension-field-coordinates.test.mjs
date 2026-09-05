import test from "node:test";
import { readFile } from "node:fs/promises";
import { createSage } from "../node-kernel.mjs";

test("Wasm finite extensions expose exact prime-field polynomials", { timeout: 120000 }, async () => {
  const sage = await createSage();
  try {
    await sage.evaluate(await readFile(new URL("../../../test/extension-field-coordinates.py", import.meta.url), "utf8"));
  } finally {
    await sage.close();
  }
});

import test from "node:test";
import { readFile } from "node:fs/promises";
import { createSage } from "../node-kernel.mjs";

test("Wasm exact-field descriptors and codecs preserve coefficient semantics", { timeout: 120000 }, async () => {
  const sage = await createSage();
  try {
    await sage.evaluate(await readFile(new URL("../../../test/exact-field-contract.py", import.meta.url), "utf8"));
  } finally {
    await sage.close();
  }
});

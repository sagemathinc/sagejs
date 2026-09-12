import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createSage} from "../node-kernel.mjs";

test("production Wasm extension multivariates retain parents and survive bounded spills", {timeout: 240000}, async () => {
  const sage = await createSage();
  try {
    const source = await readFile(new URL("../../../test/extension-multivariate.py", import.meta.url), "utf8");
    const result = await sage.evaluate(source, {timeout: 210000});
    assert.match(result.stdout, /finite-extension public multivariate arithmetic and bounded spill passed/);
    assert.equal((await sage.evaluate("2 + 2")).repr, "4");
  } finally {await sage.close();}
});

import test from "node:test";
import assert from "node:assert/strict";
import {extensionGeometryBatches} from "./extension-geometry-fixtures.mjs";
import {createSage} from "../node-kernel.mjs";

test("production Wasm exact extension ideals and geometry", {timeout: 1800000}, async () => {
  const sage = await createSage();
  try {
    for await (const batch of extensionGeometryBatches()) {
      const started = Date.now();
      console.log("Node-Wasm" + " starting " + batch.label);
      const result = await sage.evaluate(batch.source, {timeout: 240000});
      assert.match(result.stdout, /finite-extension .* passed/, batch.label);
      console.log(`Node-Wasm ${batch.label}: passed in ${Date.now() - started} ms`);
    }
    assert.equal((await sage.evaluate("2 + 2")).repr, "4");
  } finally {await sage.close();}
});

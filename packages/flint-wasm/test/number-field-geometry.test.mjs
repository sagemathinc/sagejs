import test from "node:test";
import assert from "node:assert/strict";
import {numberFieldGeometryBatches} from "./number-field-geometry-fixtures.mjs";
import {createSage} from "../node-kernel.mjs";

test("production Node-Wasm exact number-field geometry", {timeout: 3600000}, async () => {
  const sage = await createSage();
  try {
    for await (const batch of numberFieldGeometryBatches()) {
      const started = Date.now();
      console.log(`Node-Wasm starting ${batch.label}`);
      const result = await sage.evaluate(batch.source, {timeout: 350000});
      assert.match(result.stdout, /passed/, batch.label);
      console.log(`Node-Wasm ${batch.label}: passed in ${Date.now() - started} ms`);
    }
  } finally {await sage.close();}
});

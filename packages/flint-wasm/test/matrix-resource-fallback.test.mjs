import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";
import {
  expectedStdout,
  publicSource,
} from "./matrix-resource-fallback-support.mjs";

test("production Node-Wasm exact matrices survive omitted resource exports", async () => {
  const sage = await createSage();
  try {
    const result = await sage.evaluate(publicSource);
    assert.equal(result.stdout, expectedStdout);
  } finally {
    await sage.close();
  }
});

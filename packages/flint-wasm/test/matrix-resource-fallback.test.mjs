import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";
import {
  expectedStdout,
  publicSource,
  requiredResourceCapabilities,
} from "./matrix-resource-fallback-support.mjs";

test("production Node-Wasm exact matrices survive omitted resource exports", async () => {
  const sage = await createSage();
  try {
    const result = await sage.evaluate(publicSource);
    assert.equal(result.stdout, expectedStdout);
    for (const capabilityId of requiredResourceCapabilities) {
      const route = result.instrumentation.routes.find(
        (entry) => entry.capability_id === capabilityId,
      );
      assert.equal(route?.selected_route, "receipt-backed-wasm-artifact", capabilityId);
      assert.equal(route?.execution_target, "wasm-artifact", capabilityId);
      assert.ok(route.call_count > 0, capabilityId);
    }
  } finally {
    await sage.close();
  }
});

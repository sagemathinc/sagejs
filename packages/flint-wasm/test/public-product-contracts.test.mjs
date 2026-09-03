import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

test("browser-Wasm kernel exposes documentation, JSON, and rich numerical results", async (t) => {
  const session = await createSage();
  t.after(() => session.close());

  const catalog = await session.documentation();
  assert.equal(catalog.schema_version, 1);
  assert.ok(catalog.entries.some((entry) => entry.name === "find_root"));

  const numericalSource = `from sagejs.numerics import find_root
answer = find_root(lambda x: x**2 - 2, 1.0, 2.0,
                   method="brent", trace="iterations")`;
  const result = await session.evaluateJSON(`${numericalSource}\nanswer`);
  assert.equal(result.schema_version, 1);
  assert.equal(result.success, true);
  assert.ok(Math.abs(result.value - Math.sqrt(2)) < 1e-12);

  const plot = await session.evaluate(`${numericalSource}\nanswer.plot()`);
  assert.equal(plot.display.mime, "application/vnd.plotly.v1+json");
  assert.doesNotThrow(() => structuredClone(plot.display));

  const animation = await session.evaluate(`${numericalSource}\nanswer.animate()`);
  assert.equal(animation.display.mime, "application/vnd.plotly.v1+json");
  assert.ok(Array.isArray(animation.display.data.frames));
  assert.doesNotThrow(() => structuredClone(animation.display));
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createSage } from "../node-kernel.mjs";

test("portable integral morphisms, isogenies and labelled degeneracy copies", { timeout: 300000 }, async (t) => {
  const sage = await createSage({ timeout: 290000 });
  t.after(() => sage.close());
  const source = readFileSync(new URL("../../../test/fixtures/modular-abelian-morphisms.py", import.meta.url), "utf8");
  const result = await sage.evaluate(source);
  assert.equal(result.stdout.trim(), "integral morphism geometry passed");
});

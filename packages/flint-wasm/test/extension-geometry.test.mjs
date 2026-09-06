import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createSage} from "../node-kernel.mjs";

test("production Wasm exact extension ideals and geometry", {timeout: 900000}, async () => {
  const sage = await createSage();
  try {
    for (const name of ["extension-ideals", "extension-geometry", "extension-zero-dimensional"]) {
      const started = Date.now();
      const source = await readFile(new URL(`../../../test/${name}.py`, import.meta.url), "utf8");
      const result = await sage.evaluate(source, {timeout: 240000});
      assert.match(result.stdout, /finite-extension .* passed/);
      console.log(`Node-Wasm ${name}: passed in ${Date.now() - started} ms`);
    }
    const fixture = JSON.parse(await readFile(new URL(
      "../../../test/fixtures/extension-geometry-sage-oracles-v1.json", import.meta.url), "utf8"));
    const source = "import json\n_extension_geometry_cases = json.loads(" +
      JSON.stringify(JSON.stringify(fixture.cases)) + ")\n" + await readFile(new URL(
        "../../../test/extension-geometry-oracles.py", import.meta.url), "utf8");
    const result = await sage.evaluate(source, {timeout: 240000});
    assert.match(result.stdout, /geometry matches independent Sage fixtures passed/);
    assert.equal((await sage.evaluate("2 + 2")).repr, "4");
  } finally {await sage.close();}
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSage } from "../node-kernel.mjs";

const exhaustive = process.env.SAGEJS_EXTENSION_FIELDS_FULL === "1";
test("production Wasm generic Gröbner results match independent Sage fixtures", {
  timeout: exhaustive ? 900000 : 120000,
}, async () => {
  const corpus = JSON.parse(await readFile(new URL(
    "../../../test/fixtures/extension-fields-sage-oracles-v1.json", import.meta.url,
  ), "utf8"));
  const fixture = await readFile(
    new URL("../../../test/generic-groebner.py", import.meta.url), "utf8",
  );
  const batches = exhaustive
    ? Array.from({ length: 6 }, (_, i) => corpus.cases.slice(i * 18, (i + 1) * 18))
    : [[3, 29, 52, 57, 82, 107].map(i => corpus.cases[i])];
  for (const [index, cases] of batches.entries()) {
    const started = Date.now();
    const source = "import json\n_extension_field_cases = json.loads(" +
      JSON.stringify(JSON.stringify(cases)) + ")\n" + fixture;
    const sage = await createSage();
    try {
      const result = await sage.evaluate(source, { timeout: 120000 });
      assert.match(result.stdout, /generic exact-field Sage fixtures passed/);
      console.log(`Wasm Gröbner batch ${index + 1}/${batches.length}: ${cases.length} cases passed in ${Date.now() - started} ms`);
    } finally {
      await sage.close();
    }
  }
});

// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { browserModuleCache, BROWSER_MODULE_OUTPUT_KEYS } = require(
  "../packages/flint-wasm/scripts/browser-module-cache.cjs",
);

test("browser module packaging retains both used outputs and all metadata", () => {
  const cache = {
    version: "compiler-id", signature: "source-id", classes: { C: {} },
    imported_module_ids: ["dependency"], exports: ["C"],
    outputs: Object.fromEntries([true, false].flatMap((beautify) =>
      [true, false].map((docs) => [
        `beautify:${beautify} keep_docstrings:${docs}`,
        `// ${beautify} ${docs}\nconst exact = 'keep me';`,
      ]))),
  };
  const before = JSON.stringify(cache);
  const packed = browserModuleCache(cache, "fixture");
  assert.deepEqual(Object.keys(packed.outputs), BROWSER_MODULE_OUTPUT_KEYS);
  for (const key of BROWSER_MODULE_OUTPUT_KEYS) {
    assert.equal(packed.outputs[key], cache.outputs[key]);
  }
  assert.deepEqual({ ...packed, outputs: null }, { ...cache, outputs: null });
  assert.equal(JSON.stringify(cache), before);
  assert.throws(() => browserModuleCache({ ...cache, outputs: {} }, "fixture"),
    /fixture lacks output/);
});

test("browser compiler output settings match the packaged variants", () => {
  const root = path.join(__dirname, "../packages/flint-wasm");
  const worker = fs.readFileSync(path.join(root, "compiler-worker.mjs"), "utf8");
  const dynamic = fs.readFileSync(path.join(root, "dynamic-compiler.mjs"), "utf8");
  // Changing these settings requires reviewing the packaging contract too.
  assert.match(worker, /beautify: true,\s*keep_docstrings: true,/);
  assert.match(dynamic, /beautify: true,/);
  assert.doesNotMatch(worker + dynamic, /beautify: false/);
});

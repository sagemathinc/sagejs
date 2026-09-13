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

test("browser output splices preserve exact JavaScript, Unicode, and cache metadata", async () => {
  const {decodeBrowserModuleCache, createBrowserCompiler} = await import(
    "../packages/flint-wasm/dynamic-compiler.mjs"
  );
  const [withDocs, withoutDocs] = BROWSER_MODULE_OUTPUT_KEYS;
  const shared = Array.from({length: 200}, (_, i) =>
    `const value_${i} = ${i}; // \u03b1 \ud83d\ude00 exact source coordinates\r\n`).join("");
  for (const tail of ["", "\n", "\r\n", "// no trailing newline"]) {
    const outputs = {
      [withDocs]: shared + "function f() {}\nf.__doc__ = 'documentation';\n" + shared + tail,
      [withoutDocs]: shared + "function f() {}\n" + shared + tail,
    };
    const cache = {version: "compiler-id", signature: "source-id", exports: ["f"], outputs};
    const before = JSON.stringify(cache);
    const packed = browserModuleCache(cache, "fixture");
    assert.equal(packed.outputs[withDocs].type, "copy-splice-v1");
    assert.ok(JSON.stringify(packed).length < before.length / 1.5);
    assert.deepEqual(decodeBrowserModuleCache(JSON.parse(JSON.stringify(packed))), cache);
    assert.equal(JSON.stringify(cache), before);
    const compiler = createBrowserCompiler(
      'exports.cache = JSON.parse(readfile("__module_cache__/fixture.json"));',
      {modules: {fixture: {source: "pass", cache: packed}}},
    );
    assert.deepEqual(compiler.cache, cache);
  }
});

test("browser cache decoder rejects malformed ranges, cycles, and expansion overflow", async () => {
  const {decodeBrowserModuleCache} = await import("../packages/flint-wasm/dynamic-compiler.mjs");
  const packed = {type: "copy-splice-v1", base: "base", length: 3, parts: [[0, 3]]};
  const shell = {signature: "runtime-owned-metadata"};
  assert.equal(decodeBrowserModuleCache(shell), shell);
  const decode = value => decodeBrowserModuleCache({outputs: {base: "abc", target: value}});
  assert.equal(decode(packed).outputs.target, "abc");
  for (const change of [
    {type: "unknown"}, {base: "target"}, {base: "__proto__"},
    {length: -1}, {length: 64 * 1024 * 1024 + 1}, {length: 4},
    {parts: [[-1, 3]]}, {parts: [[0, 4]]}, {parts: [[0, -1]]},
    {parts: [[0, 0]]}, {parts: [[0, 1.5]]}, {parts: [[0, 1, 2]]},
    {parts: [[Number.MAX_SAFE_INTEGER, 3]]}, {parts: [null]},
    {parts: [[0, 3], [-3, 3]]}, {parts: ["long literal"]},
  ]) assert.throws(() => decode({...packed, ...change}), /browser compiler/);
});

test("Tree-sitter resource boundary restores packed module output verbatim", async () => {
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "sagejs-cache-codec-"));
  try {
    const filename = path.join(directory, "resources.mjs");
    await require("esbuild").build({
      entryPoints: [path.join(__dirname, "../packages/flint-wasm/src/compiler-resources.ts")],
      bundle: true, format: "esm", platform: "browser", outfile: filename,
    });
    const resources = await import(require("node:url").pathToFileURL(filename));
    const shared = Array.from({length: 100}, (_, i) => `const field_${i} = ${i}; // exact compiler output\n`).join("");
    const cache = {signature: "exact-cache-fixture", outputs: {
      [BROWSER_MODULE_OUTPUT_KEYS[0]]: shared + "f.__doc__ = 'retained';\n" + shared,
      [BROWSER_MODULE_OUTPUT_KEYS[1]]: shared + shared,
    }};
    const packed = browserModuleCache(cache, "fixture");
    assert.equal(packed.outputs[BROWSER_MODULE_OUTPUT_KEYS[0]].type, "copy-splice-v1");
    resources.configureBrowserCompilerResources({
      treeSitterRuntime: new Uint8Array(), pythonGrammar: new Uint8Array(), sageGrammar: new Uint8Array(),
      standardLibrary: {coreStandalone: [], modules: {fixture: {source: "pass\n", cache: packed}}},
    });
    assert.deepEqual(JSON.parse(resources.readResourceText("__module_cache__/fixture.json")), cache);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

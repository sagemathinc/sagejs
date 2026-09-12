// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const { Script } = require("node:vm");
const test = require("node:test");
const { mappedPythonScript } = require("../dist/tools/python/stack-adapter.js");

function mapped(generated, start, end, exclusions = [], cachedData) {
  const source = "capture()";
  return mappedPythonScript(generated, source, {
    schema: "sagejs.python-source-map/v1", source: { filename: "caller.py", text: source },
    generated, spans: [{ kind: "execution", start, end, depth: 0, source: { filename: "caller.py",
      name: "<module>", start: { line: 1, column: 0 }, end: { line: 1, column: source.length } } },
    ...exclusions.map(([start, end]) => ({ kind: "exclusion", start, end, depth: 0, source: null }))],
  }, cachedData);
}

test("opaque URLs accept reusable bytecode and preserve rejected-bytecode signals", () => {
  const generated = "40 + 2";
  const first = mapped(generated, 0, generated.length);
  const accepted = mapped(generated, 0, generated.length, [], first.createCachedData());
  assert.equal(accepted.cachedDataRejected, false);
  assert.equal(accepted.runInThisContext(), 42);
  const rejected = mapped(generated, 0, generated.length, [], Buffer.from("invalid bytecode"));
  assert.equal(rejected.cachedDataRejected, true);
  assert.equal(rejected.runInThisContext(), 42);
});

for (const mode of ["python", "sage"]) {
test(`${mode}: only initial known current-stack invocation trampolines can disappear`, () => {
  const helpers = ["ρσ_interpolate_kwargs", "ρσ_invoke_prepared_method",
    "_internal_bind_kwargs", "ρσ_invoke_prepared_keywords"];
  new Script("function extract_stack(){return globalThis.__sagejs_capture_python_frames__(null,extract_stack)};" +
    "function _internal_bind_kwargs(){return extract_stack()};" +
    "function ρσ_interpolate_kwargs(){return _internal_bind_kwargs()};" +
    "function ρσ_invoke_prepared_keywords(){return _internal_bind_kwargs()};" +
    "function ρσ_invoke_prepared_method(){return extract_stack()}",
  { filename: `sagejs/runtime-bootstrap-${mode}.js` }).runInThisContext();
  for (const helper of helpers) {
    const generated = `globalThis.adapterFrames = ${helper}();`;
    mapped(generated, generated.indexOf(helper), generated.length - 1).runInThisContext();
    assert.equal(globalThis.adapterFrames.at(-1).provenance, "python-source");
  }
  for (const helper of helpers) {
    new Script(`function ${helper}(){throw new Error('helper failure')};` +
      `try {${helper}()} catch(e){globalThis.adapterFailure=e}`,
    { filename: `sagejs/runtime-bootstrap-${mode}.js` }).runInThisContext();
    const failure = globalThis.__sagejs_capture_python_frames__(globalThis.adapterFailure, null).at(-1);
    assert.equal(failure.name, helper);
    assert.equal(failure.provenance, "native-stack");

    new Script(`function ${helper}(){return extract_stack()};globalThis.adapterFrames=${helper}()`,
      { filename: "user.js" }).runInThisContext();
    assert.equal(globalThis.adapterFrames.at(-1).filename, "user.js");
    assert.equal(globalThis.adapterFrames.at(-1).name, helper);

    const generated = `function ${helper}(){return extract_stack()};globalThis.adapterFrames=${helper}()`;
    mapped(generated, 0, generated.length).runInThisContext();
    assert.equal(globalThis.adapterFrames.at(-1).provenance, "python-source");
    assert.match(globalThis.adapterFrames.at(-1).raw, new RegExp(helper));
  }
});
}

test("unmapped and excluded exception body frames are both retained", () => {
  for (const excluded of [false, true]) {
    const generated = "function body(){return null.missing;} try {body();} catch(e){globalThis.adapterFailure=e;}";
    mapped(generated, generated.indexOf("try {") + 5, generated.indexOf(";} catch"),
      excluded ? [[0, generated.indexOf(" try")]] : []).runInThisContext();
    const frames = globalThis.__sagejs_capture_python_frames__(globalThis.adapterFailure, null);
    assert.equal(frames.at(-1).provenance, "generated");
    assert.match(frames.at(-1).filename, /^sagejs-python:\/\//);
    assert.equal(frames.at(-1).name, "body");
  }
  new Script("try { null.missing; } catch(e) { globalThis.adapterFailure=e; }",
    { filename: "unregistered.js" }).runInThisContext();
  const unknown = globalThis.__sagejs_capture_python_frames__(globalThis.adapterFailure, null).at(-1);
  assert.equal(unknown.provenance, "native-stack");
  assert.equal(unknown.filename, "unregistered.js");
});

// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createRequire } = require("node:module");
const { runInThisContext } = require("node:vm");
const { validateSelection } = require("../tools/python-compat/output-suite.cjs");

function fixture() {
  const filename = join(__dirname, "../scripts/run-python-compat.cjs");
  const nativeRequire = createRequire(filename);
  const loaded = {
    manifest:{suites:{first:{}, second:{}, micropython:{}, empty:{}}},
    cases:[
      {id:"first/a",suite:"first",comparison:"assertion-exit-empty-output"},
      {id:"second/b",suite:"second",comparison:"assertion-exit-empty-output"},
      ...["a.py", "b.py"].map(name => ({id:`micropython/${name}`,suite:"micropython",
        path:`basics/${name}`,comparison:"cpython-output-baseline-v2",priority:"P1",valueTags:["language"]})),
    ],
    outputComparisons:{micropython:{candidates:["a.py", "b.py"]}},
  };
  let preflightCalls = 0;
  const module = {exports:{}};
  const injectedRequire = name => {
    if (name === "./build-receipt.cjs") return {
      inspectBuildReceipt:() => {preflightCalls++; throw new Error("unexpected build preflight");},
      workspaceFingerprint:() => {preflightCalls++; throw new Error("unexpected workspace preflight");},
    };
    if (name.endsWith("/manifest.cjs")) return {loadManifest:() => loaded};
    return nativeRequire(name);
  };
  const source = readFileSync(filename,"utf8").replace(/^#![^\n]*\n/, "");
  runInThisContext(`(function(require,module,exports,__dirname,console){${source}\n})`, {filename})(
    injectedRequire,module,module.exports,join(__dirname,"../scripts"),{log(){},error(){}});
  return {...module.exports,loaded,preflightCalls:() => preflightCalls};
}

test("suite and case filters use OR within each dimension and AND across dimensions", () => {
  const f = fixture();
  const select = args => f.selectCases(f.loaded,f.parseArguments(args)).map(entry => entry.id);
  assert.deepEqual(select([]),f.loaded.cases.map(entry => entry.id));
  assert.deepEqual(select(["--suite","first","--suite","second"]),["first/a","second/b"]);
  assert.deepEqual(select(["--only","first/a","--only","second/b"]),["first/a","second/b"]);
  assert.deepEqual(select(["--suite","first","--only","first/a","--only","second/b"]),["first/a"]);
  assert.deepEqual(select(["--suite","first","--suite","first"]),["first/a"]);
  const full = f.selectCases(f.loaded,f.parseArguments(["--suite","micropython"]));
  validateSelection(f.loaded,full,false);
  const partial = f.selectCases(f.loaded,f.parseArguments(["--suite","micropython","--only","micropython/a.py"]));
  assert.throws(() => validateSelection(f.loaded,partial,false),/complete suite/);
  validateSelection(f.loaded,partial,true);
});

test("unknown, empty, and empty-intersection selections fail before execution or list output", async () => {
  const f = fixture();
  for (const [args,pattern] of [
    [["--suite","missing"],/unknown suite/],
    [["--suite","toString"],/unknown suite/],
    [["--suite","empty"],/empty suite/],
    [["--suite","first","--suite","missing"],/unknown suite/],
    [["--only","missing"],/unknown case/],
    [["--suite","first","--only","second/b"],/selection is empty/],
  ]) {
    for (const extra of [[],["--list"],["--artifact-report"]]) {
      await assert.rejects(f.main([...args,...extra]),pattern);
    }
  }
  assert.throws(() => f.parseArguments(["--suite"]),/missing value/);
  assert.throws(() => f.parseArguments(["--suite",""]),/missing value/);
  assert.throws(() => f.parseArguments(["--suite","--list"]),/missing value/);
  assert.throws(() => f.selectCases({...f.loaded,cases:[]},f.parseArguments([])),/selection is empty/);
  await assert.rejects(f.main(["--suite","micropython","--only","micropython/a.py"]),/complete suite/);
  assert.equal(await f.main(["--suite","micropython","--list"]),0);
  assert.equal(f.preflightCalls(),0);
});

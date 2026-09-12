// sagejs-test-tier: native
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
const {aggregatorSource} = require("../../../tools/native-kernel/production-pack.cjs");

test("only nonempty all-binary64, library-free packs omit the exact allocator",()=>{
  const item = {logicalSource:"fixture",moduleIdentity:"0".repeat(16),cacheKey:"1".repeat(64),
    ir:{functions:[{kernelKind:"float64"}],foreignLibraries:[]}};
  assert.doesNotMatch(aggregatorSource([item],"2".repeat(64)),/#include <gmp\.h>/);
  for (const ir of [undefined, {functions:[]}, {functions:[{kernelKind:"real-field"}]},
    {functions:[{kernelKind:"float64"},{kernelKind:"exact-integer"}]},
    ...[null,"",{},[{id:"test-library"}]].map(foreignLibraries=>
      ({functions:[{kernelKind:"float64"}],foreignLibraries}))]) {
    assert.match(aggregatorSource([{...item,ir}],"2".repeat(64)),/#include <gmp\.h>/);
  }
  assert.match(aggregatorSource([],"2".repeat(64)),/#include <gmp\.h>/);
});

for (const mode of ["float-only","mixed"]) {
  test(`relocated ${mode} generated pack preserves exact oracles`,{timeout:240000},()=>{
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-pack-dependencies-"));
    try {
      const result = spawnSync(process.execPath,[path.join(__dirname,"prefix-free-pack-worker.cjs"),mode,temporary],
        {cwd:path.resolve(__dirname,"../../.."),encoding:"utf8",timeout:220000,maxBuffer:8*1024*1024,
          env:{...process.env,SAGEJS_NATIVE_MODE:"native",SAGEJS_NATIVE_REQUIRED:"1",
            ...(mode === "float-only" ? {SAGEJS_FLINT_PREFIX:path.join(temporary,"absent-exact-prefix")} : {})}});
      if (result.error) throw result.error;
      assert.equal(result.status,0,result.stderr || result.stdout);
      const report = JSON.parse(result.stdout.trim().split("\n").at(-1));
      assert.equal(report.cases,200);
      assert.equal(report.relocated_without_standalone_addons,true);
      console.log(JSON.stringify(report));
    } finally {
      // Loaded addons live only in the completed child, including on Windows.
      fs.rmSync(temporary,{recursive:true,force:true});
    }
  });
}

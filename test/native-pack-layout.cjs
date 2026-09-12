// sagejs-test-tier: portable
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const layout = require("../tools/native-pack-layout.js");
const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64), d = "d".repeat(64);
const catalog = () => ({schema:layout.SCHEMA, complete:true, expectedKernels:2,
  packs:[{packKey:a,kernels:[c]},{packKey:b,kernels:[d]}],
  logicalSources:{numerical:{packKey:a,cacheKey:c},exact:{packKey:b,cacheKey:d}}});

test("content-addressed paths retain the generated wrapper's sibling pack layout", () => {
  const index = catalog();
  const paths = layout.catalogPaths(index);
  assert.equal(paths.length,7);
  for (const record of Object.values(index.logicalSources)) {
    assert.deepEqual(layout.parseModulePath(layout.modulePath(record)),record);
    assert.ok(paths.includes(layout.modulePath(record)));
    assert.ok(paths.includes(`${layout.packDirectory(record.packKey)}/pack/${layout.PACK_FILENAME}`));
    assert.equal(layout.selectedPack(index,record).packKey,record.packKey);
  }
});

test("unsafe paths, incomplete catalogs and ambiguous memberships fail closed", () => {
  for (const value of ["../"+a,a.toUpperCase(),"",null,{},a+"/../"+b]) {
    assert.throws(()=>layout.packDirectory(value));
  }
  for (const value of [`${a}/index.cjs`,`packs/${a}/${c}/../index.cjs`,
    `packs\\${a}\\${c}\\index.cjs`,`/packs/${a}/${c}/index.cjs`]) {
    assert.throws(()=>layout.parseModulePath(value));
  }
  for (const mutate of [
    x=>{x.schema="sagejs.native-cache/v4";}, x=>{x.complete=false;},
    x=>{x.expectedKernels=3;}, x=>{x.packs.push(x.packs[0]);},
    x=>{x.packs[0].kernels.push(c);}, x=>{x.packs[1].kernels=[c];},
    x=>{delete x.logicalSources.exact;}, x=>{x.logicalSources.exact.packKey=a;},
    x=>{x.logicalSources=null;}, x=>{x.logicalSources=[];},
    x=>{x.logicalSources.extra={cacheKey:c,packKey:a};},
  ]) {
    const index = catalog(); mutate(index);
    assert.throws(()=>layout.catalogPaths(index));
  }
  assert.equal(layout.selectedPack(catalog(),{packKey:a,cacheKey:d}),undefined);
  const ambiguous = catalog(); ambiguous.packs.push(ambiguous.packs[0]);
  assert.equal(layout.selectedPack(ambiguous,ambiguous.logicalSources.numerical),undefined);
});

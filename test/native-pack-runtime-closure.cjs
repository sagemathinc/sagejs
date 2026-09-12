// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const test=require("node:test");
const {nativePackCatalog}=require("./helpers/native-pack-catalog.cjs");
const {currentCatalogClosure,closurePaths,validateCatalogClosure,CURRENT_CLOSURE,LEGACY_CLOSURE}
  =require("../bench/class-unit-groups/native-pack-runtime-closure.cjs");
test("versioned closures authenticate the entire catalog and preserve historical paths",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-native-catalog-closure-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const fixture=nativePackCatalog(root),catalog=currentCatalogClosure(root);
  const closure={schema:CURRENT_CLOSURE,native_cache_key:fixture.rows[0].cache,
    native_pack_catalog:catalog,production_native_pack:catalog.packs[0]};
  validateCatalogClosure(closure);
  const currentPaths=closurePaths(closure);
  assert.equal(currentPaths.pack,catalog.packs[0].path);
  assert.match(currentPaths.standalone,/\/packs\/[a-f0-9]{64}\/7+\/build\/Release\//);
  const old={...closure,schema:LEGACY_CLOSURE}; delete old.native_pack_catalog;
  validateCatalogClosure(old);
  assert.equal(closurePaths(old).pack,"dist/native-kernels/pack/sagejs_native_kernel_pack.node");
  assert.equal(closurePaths(old).standalone,`dist/native-kernels/${old.native_cache_key}/build/Release/sagejs_native_kernel.node`);
  for (const mutate of [
    x=>{x.schema="unknown";},x=>{delete x.native_pack_catalog;},
    x=>{x.native_pack_catalog.packs=[];},x=>{x.native_pack_catalog.packs.push(x.native_pack_catalog.packs[0]);},
    x=>{x.native_pack_catalog.packs[0].path="../unbound.node";},
    x=>{x.native_pack_catalog.packs[0].sha256="wrong";},
    x=>{x.native_pack_catalog.packs[0]=null;},
    x=>{x.native_pack_catalog.packs[0].bytes=123;},
    x=>{x.production_native_pack.bytes="100000";},
  ]) {
    const invalid=JSON.parse(JSON.stringify(closure)); mutate(invalid);
    assert.throws(()=>validateCatalogClosure(invalid));
  }
  fs.appendFileSync(fixture.rows[1].addon," invalid");
  assert.throws(()=>currentCatalogClosure(root),/inconsistent production native pack/);
  fixture.authenticate();
  const next=currentCatalogClosure(root);
  assert.notEqual(next.sha256,catalog.sha256);
  assert.notEqual(next.packs[1].sha256,catalog.packs[1].sha256);
});

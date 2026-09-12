"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const {createHash} = require("node:crypto");
const {spawnSync} = require("node:child_process");
const {createRequire, wrap} = require("node:module");
const {runInThisContext} = require("node:vm");
const {compileKernel} = require("../../../tools/native-kernel/compiler.cjs");
const {publishProductionKernels} = require("../../../scripts/build-production-native-kernels.cjs");
const layout = require("../../../tools/native-pack-layout.js");
const root = path.resolve(__dirname,"../../..");
const temporary = process.argv[2];
async function main() {
  const built = [];
  for (const [source,functions] of [
    ["src/lib/sagejs/numerics/statistics/_packed.py",["finite_sum"]],
    ["test/numerics/performance/prefix-free-pack.py",["exact_twice"]],
  ]) {
    const absoluteSource = path.join(root,source), logicalSource = source.replace(/^src\/lib\//,"");
    const item = await compileKernel({sourcePath:absoluteSource,sourceKey:logicalSource,functions,
      cacheRoot:path.join(temporary,"compile"),jobs:1});
    built.push({...item,absoluteSource,logicalSource,
      sourceHash:createHash("sha256").update(fs.readFileSync(absoluteSource)).digest("hex")});
  }
  const published = path.join(temporary,"published");
  const {index} = await publishProductionKernels({built,cacheRoot:path.join(temporary,"aggregate"),outputRoot:published});
  assert.equal(index.packs.length,2);
  for (const file of layout.catalogPaths(index)) assert.ok(fs.statSync(path.join(published,file)).isFile());
  const numerical = index.logicalSources[built[0].logicalSource], exact = index.logicalSources[built[1].logicalSource];
  assert.notEqual(numerical.packKey,exact.packKey);
  // Remove the exact pack from the runtime tree before the numerical public
  // import. A root catalog describing it must not make it an eager dependency.
  const exactDirectory = path.join(published,layout.packDirectory(exact.packKey));
  fs.renameSync(exactDirectory,path.join(temporary,"withheld-exact-pack"));
  const numericalWrapper = require(path.join(published,layout.modulePath(numerical)));
  assert.equal(numericalWrapper.finite_sum.nativeAvailable,true);
  const output = new Float64Array(1);
  assert.equal(numericalWrapper.finite_sum(new Float64Array([1e100,1,-1e100]),new Float64Array(3),output,3),0);
  assert.equal(output[0],1);
  const probeOptions = {
    cwd:root,encoding:"utf8",timeout:120000,
    env:{...process.env,SAGEJS_NATIVE_CACHE_DIR:published,SAGEJS_NATIVE_REQUIRED:"1",SAGEJS_NATIVE_MODE:"native"},
    input:"from sagejs.numerics.statistics._packed import finite_sum\nfrom sagejs.native import is_compiled\nprint(is_compiled(finite_sum))\nprint(finite_sum.nativeAvailable)\n"};
  const runProbe = () => spawnSync(process.execPath,[path.join(root,"bin/sagejs"),"--python"],probeOptions);
  const probe = runProbe();
  assert.equal(probe.status,0,probe.stdout+probe.stderr);
  assert.equal(probe.stdout.trim(),"True\nTrue");
  const invalidIndex = structuredClone(index);
  invalidIndex.logicalSources[built[0].logicalSource].packKey = exact.packKey;
  invalidIndex.sources[built[0].absoluteSource].packKey = exact.packKey;
  fs.writeFileSync(path.join(published,"index.json"),JSON.stringify(invalidIndex));
  const rejectedProbe = runProbe();
  assert.notEqual(rejectedProbe.status,0);
  assert.match(rejectedProbe.stderr,/finite_sum.*has no matching compiled artifact/);
  assert.doesNotMatch(rejectedProbe.stdout,/True/);
  fs.writeFileSync(path.join(published,"index.json"),JSON.stringify(index));
  // Execute the actual compiled SEA resource loader with a controlled asset
  // transport. Native extraction/loading is real; this is not a SEA binary
  // publication or a substitute for end-to-end SEA qualification.
  const assetReads = [];
  function seaResources(mutateManifest) {
    const filename = path.join(root,"dist/tools/resources.js");
    const actualRequire = createRequire(filename), module = {exports:{}};
    const getAsset = (key) => {
      assetReads.push(key);
      const data = fs.readFileSync(path.join(published,key.replace(/^native-kernels\//,"")));
      if (mutateManifest && key.endsWith("/pack/index.json")) {
        const manifest = JSON.parse(data); mutateManifest(manifest);
        return Buffer.from(JSON.stringify(manifest));
      }
      return data;
    };
    runInThisContext(wrap(fs.readFileSync(filename,"utf8")),{filename})(
      module.exports,name=>name === "node:sea" ? {
        isSea:()=>true,getAsset,getAssetKeys:()=>layout.catalogPaths(index).map(p=>"native-kernels/"+p),
      } : actualRequire(name),module,filename,path.dirname(filename));
    const extraction = fs.mkdtempSync(path.join(temporary,"sea-extraction-"));
    module.exports.useSharedSingleExecutableNativeResourceDirectory(extraction);
    return {resources:module.exports,extraction};
  }
  const virtualModule = "/__sagejs_sea__/native-kernels/"+layout.modulePath(numerical);
  for (const mutate of [m=>{m.packKey=exact.packKey;},m=>{m.sha256="0".repeat(64);},
    m=>{m.kernels=[];},m=>{m.bytes++;},m=>{m.nativeAbi--;},m=>{m.architecture="invalid";}]) {
    const {resources} = seaResources(mutate);
    assert.throws(()=>resources.loadPrecompiledNativeKernel(virtualModule,"numerical-test"),/pack is invalid/);
  }
  const {resources,extraction} = seaResources();
  const embedded = resources.loadPrecompiledNativeKernel(virtualModule,"numerical-test");
  assert.equal(embedded.finite_sum.nativeAvailable,true);
  assert.equal(embedded.finite_sum(new Float64Array([1e100,1,-1e100]),new Float64Array(3),output,3),0);
  assert.equal(output[0],1);
  assert.equal(fs.existsSync(path.join(extraction,"native-kernels",layout.packDirectory(exact.packKey))),false);
  assert.equal(assetReads.some(key=>key.includes(exact.packKey)),false);
  fs.renameSync(path.join(temporary,"withheld-exact-pack"),exactDirectory);
  const exactWrapper = require(path.join(published,layout.modulePath(exact)));
  assert.equal(exactWrapper.exact_twice(1n<<200n),1n<<201n);
  console.log(JSON.stringify({packs:2,numericalPublicAutoloadWithoutExactPack:true,
    seaResourceExtractionWithoutExactPack:true,corruptManifestsRejected:6,exactBits:202}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

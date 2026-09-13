"use strict";

const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const {createHash} = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {compileKernel} = require("../../../tools/native-kernel/compiler.cjs");
const {buildProductionPack,PACK_FILENAME} = require("../../../tools/native-kernel/production-pack.cjs");
const root = path.resolve(__dirname,"../../..");
const [mode, temporary] = process.argv.slice(2);
assert.ok(["float-only","mixed"].includes(mode));
const hash = data => createHash("sha256").update(data).digest("hex");

async function main() {
  const sources = [
    ["src/lib/sagejs/numerics/statistics/_packed.py",["finite_sum"]],
    ["test/numerics/performance/prefix-free-pack.py",mode === "mixed" ? ["float_twice","exact_twice"] : ["float_twice"]],
  ];
  const items = [];
  for (const [relative,functions] of sources) {
    const sourcePath = path.join(root,relative);
    const compiled = await compileKernel({sourcePath,functions,cacheRoot:path.join(temporary,"compile"),jobs:1});
    items.push({...compiled,logicalSource:relative,sourceHash:hash(fs.readFileSync(sourcePath))});
  }
  const pack = await buildProductionPack({items,cacheRoot:path.join(temporary,"aggregate")});
  const aggregator = fs.readFileSync(path.join(path.dirname(pack.manifestPath),"pack.c"),"utf8");
  if (mode === "float-only") {
    assert.doesNotMatch(aggregator,/#include <gmp\.h>/);
    assert.equal(fs.existsSync(process.env.SAGEJS_FLINT_PREFIX),false);
    const target = JSON.parse(fs.readFileSync(path.join(path.dirname(pack.manifestPath),"binding.gyp"),"utf8")).targets[0];
    assert.ok(target.libraries.every(library=>library === "-lm"));
    // The existing compiler may list an unused prefix include directory.
    // Successful compilation with that directory absent proves it is not a
    // required header/dependency; no library from it is linked.
  } else {
    assert.match(aggregator,/#include <gmp\.h>/);
  }
  const published = path.join(temporary,"relocated");
  fs.mkdirSync(path.join(published,"pack"),{recursive:true});
  fs.copyFileSync(pack.addonPath,path.join(published,"pack",PACK_FILENAME));
  fs.copyFileSync(pack.manifestPath,path.join(published,"pack/index.json"));
  for (const item of items) {
    fs.mkdirSync(path.join(published,item.cacheKey),{recursive:true});
    fs.copyFileSync(item.modulePath,path.join(published,item.cacheKey,"index.cjs"));
    assert.equal(fs.existsSync(path.join(published,item.cacheKey,"build")),false);
  }
  const wrappers = items.map(item=>require(path.join(published,item.cacheKey,"index.cjs")));
  assert.equal(wrappers[1].float_twice.nativeAvailable,true);
  assert.equal(wrappers[1].float_twice(1.25),2.5);
  assert.ok(Object.is(wrappers[1].float_twice(-0),-0));
  if (mode === "mixed") assert.equal(wrappers[1].exact_twice(1n<<200n),1n<<201n);
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const corpus = JSON.parse(execFileSync(python,["-I",path.join(__dirname,"packed-reductions.py")],
    {encoding:"utf8",timeout:120000})).cases;
  assert.equal(corpus.length,200);
  const bits = value => { const b=Buffer.alloc(8);b.writeDoubleBE(value);return b.toString("hex"); };
  for (const row of corpus) {
    const input = Float64Array.from(row.values,hex=>Buffer.from(hex,"hex").readDoubleBE());
    const output = new Float64Array([27,-31]), scratch = new Float64Array(input.length);
    assert.equal(wrappers[0].finite_sum(input,scratch,output,input.length),row.status,row.name);
    assert.equal(bits(output[0]),row.answer,row.name);
    assert.equal(output[1],-31);
    assert.deepEqual(Array.from(input,bits),row.values);
  }
  const reused = await buildProductionPack({items,cacheRoot:path.join(temporary,"aggregate")});
  assert.equal(reused.cached,true);
  assert.equal(reused.packKey,pack.packKey);
  assert.equal(pack.manifest.sha256,hash(fs.readFileSync(pack.addonPath)));
  console.log(JSON.stringify({mode,cases:corpus.length,pack_bytes:pack.manifest.bytes,
    pack_key:pack.packKey,pack_sha256:pack.manifest.sha256,relocated_without_standalone_addons:true,
    prefix_free:mode === "float-only",node:process.version,platform:process.platform,arch:process.arch}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

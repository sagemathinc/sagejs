"use strict";
// Sampling driver for a hash-checked diagnostic bundle, never timing evidence.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {performance}=require("node:perf_hooks");
const [directory,name,fieldText,callsText="10000",seedText="712367",...extra]=process.argv.slice(2);
assert.ok(directory&&name&&fieldText&&!extra.length);
const calls=Number(callsText);assert.ok(Number.isSafeInteger(calls)&&calls>0&&calls<=1000000);
let seed=Number(seedText);assert.ok(Number.isSafeInteger(seed)&&seed>=0&&seed<=4294967295);
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const manifest=JSON.parse(fs.readFileSync(path.join(directory,"builds.json")));
assert.equal(manifest.schema,"sagejs.diagnostic/portable-cubic-ablation-v1");
const record=manifest.records.find(r=>r.name===name);assert.ok(record);
assert.match(name,/^[a-z0-9_-]+$/);
const base=path.resolve(directory,name),modulePath=path.join(base,"index.cjs");
assert.equal(hash(fs.readFileSync(modulePath)),record.moduleSha256);
assert.equal(hash(fs.readFileSync(path.join(base,"source.py"))),record.sourceSha256);
assert.equal(hash(fs.readFileSync(path.join(base,"build/Release/sagejs_native_kernel.node"))),record.addonSha256);
const field=JSON.parse(fieldText);assert.equal(field.coefficients.length,4);
const m=require(modulePath);assert.equal(m.nativeAvailable,true);
const k=m.certified_complex_cubic_class_group_v1,output=k.createIntegerBuffer(64,256);
const coefficients=k.packIntegerBuffer(field.coefficients.map(BigInt));
const buffers=[k.createUInt64Buffer(4161),...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))];
function run(){
  assert.equal(k(output,coefficients,...buffers,0,5,1048576,3145728),true);
  assert.equal(String(output.toArray()[1]),String(field.h));
}
for(let i=0;i<100;i++)run();
for(let i=0;i<calls;i++){
  run();
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const until=performance.now()+seed/4294967296;
  while(performance.now()<until){} // Seeded 0–1 ms delay reduces periodic aliasing.
}
console.log(JSON.stringify({schema:"sagejs.diagnostic/cubic-sampling-driver-v1",timing:false,
  warmups:100,calls,initialSeed:Number(seedText),jitter:"seeded 0–1 ms busy waits",
  record,field,output:output.toArray().map(String)},null,2));

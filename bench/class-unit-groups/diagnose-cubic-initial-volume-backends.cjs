"use strict";
// Untimed same-source backend comparison, not independent certificate replay.
const fs=require("node:fs"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const [manifestPath,corpusPath,...extra]=process.argv.slice(2);assert.ok(manifestPath&&corpusPath&&!extra.length);
const manifest=JSON.parse(fs.readFileSync(manifestPath)),r=manifest.records[0];
assert.equal(manifest.checkpoint_trace,false);
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(r.sourcePath)).digest("hex"),r.sourceSha256);
const k=require(r.modulePath).certified_complex_cubic_class_group_v1;
assert.equal(k.nativeAvailable,true);
const corpus=JSON.parse(fs.readFileSync(corpusPath));
const fields=corpus.records.find(x=>x.name===r.name).observations;
const observations=[];
for(const [i,field] of fields.entries()){
  let reference;
  for(const backend of ["fmpz","gmp","javascript"]){
    const output=k.createIntegerBuffer(64,256);
    const scratch=[k.createUInt64Buffer(4161),...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))];
    const accepted=k[backend](output,k.packIntegerBuffer(field.coefficients.map(BigInt)),...scratch,0,5,1048576,3145728);
    const values=output.toArray().map(String);
    assert.equal(accepted,field.accepted,`${field.label}: ${backend} acceptance`);
    if(accepted){assert.equal(values[1],field.h);assert.deepEqual(values.slice(3,3+Number(values[2])).sort(),field.invariants);}
    if(reference)assert.deepEqual(values,reference,`${field.label}: ${backend} output`);else reference=values;
  }
  observations.push({label:field.label,accepted:field.accepted,output:reference});
  if((i+1)%100===0)console.error(`${i+1} / ${fields.length}`);
}
console.log(JSON.stringify({schema:"sagejs.diagnostic/cubic-initial-volume-backends-v1",promotion:false,
  independent_exact_replay:false,backends:["fmpz","gmp","javascript"],manifest,
  corpus_sha256:crypto.createHash("sha256").update(fs.readFileSync(corpusPath)).digest("hex"),observations},null,2));

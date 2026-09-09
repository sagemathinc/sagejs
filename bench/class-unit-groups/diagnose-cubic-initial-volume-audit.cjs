"use strict";
// Audit every twelve-factor observation in the development run, not holdout data.
const fs=require("node:fs"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const [manifestPath,corpusPath,...extra]=process.argv.slice(2);assert.ok(manifestPath&&corpusPath&&!extra.length);
const manifest=JSON.parse(fs.readFileSync(manifestPath)),r=manifest.records[0];
assert.equal(manifest.discovery_state_audit,true);
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(r.sourcePath)).digest("hex"),r.sourceSha256);
const k=require(r.modulePath).certified_complex_cubic_class_group_v1;
assert.equal(k.nativeAvailable,true);
const fields=JSON.parse(fs.readFileSync(corpusPath)).records.find(x=>x.name===r.name).observations.filter(x=>x.output?.[21]==="12");
assert.ok(fields.length>0);
const observations=fields.map(field=>{
  const output=k.createIntegerBuffer(64,256),trace=k.createIntegerBuffer(256,64),state=k.createIntegerBuffer(32768,4096);
  const scratch=[k.createUInt64Buffer(4161),...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))];
  const accepted=k(output,k.packIntegerBuffer(field.coefficients.map(BigInt)),...scratch,0,5,1048576,3145728,trace,state);
  const values=output.toArray().map(String),marks=trace.toArray().map(String);
  assert.equal(accepted,field.accepted,field.label);
  assert.deepEqual(values,field.output,field.label);
  assert.equal(marks[12],"0",`${field.label}: persistent state changed`);
  assert.equal(marks[9],marks[3],`${field.label}: unaudited closure attempt`);
  // Visit snapshots start at 20000, disjoint from the older state snapshot.
  assert.ok(Number(marks[10])<=20000,`${field.label}: overlapping audit storage`);
  return {label:field.label,coefficients:field.coefficients,accepted,output:values,trace:marks};
});
console.log(JSON.stringify({schema:"sagejs.diagnostic/cubic-initial-volume-audit-v1",promotion:false,timing:false,
  independent_exact_replay:false,manifest,corpus_sha256:crypto.createHash("sha256").update(fs.readFileSync(corpusPath)).digest("hex"),observations},null,2));

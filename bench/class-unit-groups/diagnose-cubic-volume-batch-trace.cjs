"use strict";
// Untimed, instrumented checkpoint observations, never timing evidence.
const fs = require("node:fs"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const [manifestPath, ...extra] = process.argv.slice(2);
assert.ok(manifestPath && !extra.length);
const manifest = JSON.parse(fs.readFileSync(manifestPath));
assert.equal(manifest.checkpoint_trace,true);
const record = manifest.records[0];
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(record.sourcePath)).digest("hex"),record.sourceSha256);
const moduleExports = require(record.modulePath);
assert.equal(moduleExports.nativeAvailable,true);
const k = moduleExports.certified_complex_cubic_class_group_v1;
// Include the actual first lost corpus field, not a guessed defining polynomial.
const corpus = JSON.parse(fs.readFileSync("build/cubic-next-evidence/volume-batch-corpus-early.json"));
const lost = corpus.records[0].observations.find(o=>o.label==="3.1.78223.1");
assert.ok(lost);
const fields = [{coefficients:[122,-7,-1,1],h:"8",invariants:["2","4"]},lost];
const observations = fields.map(({coefficients,h,invariants})=>{
  const output = k.createIntegerBuffer(64,256), trace = k.createIntegerBuffer(256,64);
  const scratch = [k.createUInt64Buffer(4161),...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))];
  const accepted = k(output,k.packIntegerBuffer(coefficients.map(BigInt)),...scratch,0,5,1048576,3145728,trace);
  if (accepted) {
    const values = output.toArray().map(String);
    assert.equal(values[1],h);
    assert.deepEqual(values.slice(3,3+Number(values[2])).sort(),invariants);
  }
  return {coefficients,accepted,output:output.toArray().map(String),trace:trace.toArray().map(String)};
});
console.log(JSON.stringify({schema:"sagejs.diagnostic/cubic-volume-checkpoints-v1",promotion:false,timing:false,
  independent_exact_replay:false,manifest,observations},null,2));

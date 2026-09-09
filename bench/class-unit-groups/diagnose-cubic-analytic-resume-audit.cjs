"use strict";
// Native state audit on existing development fields. Never a timing run.
const fs = require("node:fs"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const [manifestPath, previousCorpus, ...extra] = process.argv.slice(2);
assert.ok(manifestPath && previousCorpus && !extra.length);
const manifest = JSON.parse(fs.readFileSync(manifestPath));
assert.equal(manifest.discovery_state_audit,true);
const record = manifest.records[0];
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(record.sourcePath)).digest("hex"),record.sourceSha256);
const mod = require(record.modulePath);assert.equal(mod.nativeAvailable,true);
const k = mod.certified_complex_cubic_class_group_v1;
const previous = JSON.parse(fs.readFileSync(previousCorpus));
const old = previous.records.find(r=>r.name==="baseline").observations;
const early = previous.records.find(r=>r.name==="volume-batch-early").observations;
assert.equal(old.length,early.length);
const fields = [{label:"target",coefficients:["122","-7","-1","1"],h:"8",invariants:["2","4"]},
  ...old.filter((o,i)=>{assert.equal(o.label,early[i].label);return o.accepted && !early[i].accepted;})];
assert.equal(fields.length,14);
const observations = fields.map(field=>{
  const output = k.createIntegerBuffer(64,256), trace = k.createIntegerBuffer(256,64);
  const state = k.createIntegerBuffer(32768,4096);
  const scratch=[k.createUInt64Buffer(4161),...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))];
  const accepted = k(output,k.packIntegerBuffer(field.coefficients.map(BigInt)),...scratch,0,5,1048576,3145728,trace,state);
  const values = output.toArray().map(String), marks = trace.toArray().map(String);
  assert.equal(marks[12],"0",`${field.label}: retained discovery changed at entry ${marks[12]}, attempt ${marks[13]}`);
  assert.equal(marks[9],marks[3],`${field.label}: not every proof attempt audited`);
  if (accepted) {
    assert.equal(values[1],field.h);
    assert.deepEqual(values.slice(3,3+Number(values[2])).sort(),field.invariants);
  }
  return {...field,accepted,output:values,trace:marks};
});
console.log(JSON.stringify({schema:"sagejs.diagnostic/cubic-analytic-resume-audit-v1",promotion:false,timing:false,
  independent_exact_replay:false,manifest,observations},null,2));

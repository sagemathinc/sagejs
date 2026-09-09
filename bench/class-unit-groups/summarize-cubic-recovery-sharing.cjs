"use strict";
// Hash-bound diagnostic comparison, not a production qualification receipt.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const [beforePath, afterPath, timingPath, ...extra] = process.argv.slice(2);
assert(beforePath && afterPath && timingPath && !extra.length);
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p));
const before = read(beforePath), after = read(afterPath), timing = read(timingPath);
assert.equal(before.schema, 'sagejs.diagnostic/cubic-ablation-smoke-v1');
assert.equal(after.schema, before.schema);
assert.equal(before.corpusHash, '81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd');
assert.equal(after.corpusHash, before.corpusHash);
assert.equal(before.records.length, 1);
assert.equal(after.records.length, 1);
assert.equal(before.records[0].name, 'torsion_probe');
assert.equal(after.records[0].name, 'shared_recovery');
assert.deepEqual(after.records[0].observations, before.records[0].observations);
assert.equal(after.records[0].observations.length, 1012);
assert.equal(timing.schema, 'sagejs.diagnostic/cubic-ablation-timing-v1');
const median = xs => xs.toSorted((a,b) => a-b)[Math.floor(xs.length / 2)];
const resources = [before.records[0], after.records[0]].map(r => {
  assert.equal(hash(r.sourcePath), r.sourceSha256);
  const base = path.dirname(r.modulePath), core = path.join(base, 'kernel_core.c');
  const source = fs.readFileSync(core, 'utf8');
  const moduleSha256 = hash(r.modulePath);
  const addonSha256 = hash(path.join(base, 'build/Release/sagejs_native_kernel.node'));
  const timed = timing.builds.records.find(x => x.name === r.name);
  assert(timed);
  assert.equal(timed.sourceSha256, r.sourceSha256);
  assert.equal(timed.moduleSha256, moduleSha256);
  assert.equal(timed.addonSha256, addonSha256);
  return {
    name: r.name, sourceSha256: r.sourceSha256, moduleSha256, addonSha256,
    pythonBytes: fs.statSync(r.sourcePath).size, coreSha256: hash(core),
    files: Object.fromEntries(['kernel_core.c', 'kernel_core.h', 'kernel.c', 'build/Release/sagejs_native_kernel.node'].map(f => [f, fs.statSync(path.join(base,f)).size])),
    sourcePathOccurrences: source.split(r.sourcePath).length - 1,
    pathNormalizedCoreBytes: Buffer.byteLength(source.split(r.sourcePath).join('source.py')),
  };
});
const times = timing.fields.map(f => {
  const samples = timing.samples.filter(s => s.coefficients.join() === f.coefficients.join());
  const select = name => samples.filter(s => s.name === name);
  const baseline = select('torsion_probe'), candidate = select('shared_recovery');
  for (const name of ['torsion_probe','shared_recovery','pari']) {
    assert.deepEqual(select(name).map(s=>s.round).sort(), [0,1,2,3,4,5,6]);
    for (const s of select(name)) assert(Number.isFinite(s.ms) && s.ms > 0);
  }
  return {
    coefficients: f.coefficients,
    medianMs: Object.fromEntries(['torsion_probe','shared_recovery','pari'].map(name=>[name,median(select(name).map(s=>s.ms))])),
    medianPairedRatio: median(candidate.map(s=>s.ms/baseline.find(b=>b.round===s.round).ms)),
  };
});
console.log(JSON.stringify({
  schema: 'sagejs.diagnostic/cubic-recovery-sharing-summary-v1',
  promotion: false, public_receipt_qualified: false, independent_exact_replay: false,
  inputs: Object.fromEntries([beforePath,afterPath,timingPath].map(p=>[p,hash(p)])),
  corpusHash: before.corpusHash, identicalObservations: 1012,
  accepts: after.records[0].observations.filter(o=>o.accepted).length,
  declines: after.records[0].observations.filter(o=>!o.accepted).length,
  exceptions: after.records[0].observations.filter(o=>o.error).length,
  resources, times,
},null,2));

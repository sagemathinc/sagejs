"use strict";
// Untimed, deliberately unsuccessful diagnostic calls. Not a certificate.
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function capture(record, coefficients, effort = 5) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(record.sourcePath)).digest('hex'), record.sourceSha256);
  const module = require(record.modulePath);
  assert.equal(module.nativeAvailable, true);
  const k = module.certified_complex_cubic_class_group_v1;
  function run(n = 0, r = 0) {
    const out = k.createIntegerBuffer(64, 256);
    const scratch = [512,4,9,16,16,144,48,109].map(size => k.createIntegerBuffer(size,64));
    const transcripts = [9*n || 1,n*r || 1,3*r || 1].map(size => k.createIntegerBuffer(size,64));
    const accepted = k(out,k.packIntegerBuffer(coefficients.map(BigInt)),k.createUInt64Buffer(4161),
      ...scratch,...transcripts,1,effort,1048576,3145728);
    const output = out.toArray().map(String);
    assert.equal(accepted,false);
    assert.equal(output[63],'900','capture exit not reached');
    return {output,analysis:scratch[0].toArray().map(String),basis:scratch[2].toArray().map(String),
      transcripts:transcripts.map(buffer => buffer.toArray().map(String))};
  }
  const probe = run();
  const n = Number(probe.output[50]), r = Number(probe.output[51]);
  assert.ok(n > 0 && n <= 64 && r > 0 && r <= 1024);
  const result = run(n,r);
  assert.equal(result.output[62],'1');
  assert.deepEqual(result.output.slice(50,55),probe.output.slice(50,55));
  return {name:record.name,sourceSha256:record.sourceSha256,cacheKey:record.cacheKey,
    coefficients,effort,...result};
}
function main() {
  const [manifestPath,...extra] = process.argv.slice(2);
  assert.ok(manifestPath && !extra.length);
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  assert.equal(manifest.schema,'sagejs.diagnostic/raw-cubic-relation-capture-v1');
  assert.equal(manifest.can_certify,false);
  console.log(JSON.stringify({schema:'sagejs.diagnostic/raw-cubic-relations-v1',
    diagnostic_only:true,independent_exact_replay:false,can_certify:false,
    records:manifest.records.map(record => capture(record,['122','-7','-1','1']))},null,2));
}
module.exports = {capture};
if(require.main === module) main();

"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const {createHash} = require("node:crypto"), {execFileSync} = require("node:child_process");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const root = path.resolve(__dirname,"../../../../..");
const report = JSON.parse(fs.readFileSync(path.join(__dirname,"report.json"),"utf8"));
assert.equal(report.schema,"sagejs.numerical-multipack-sea-fixtures/v1");
assert.match(report.sourceCommit,/^[a-f0-9]{40}$/);
assert.equal(report.publicLatencyClassification,"unmeasured");
for (const [filename,digest] of Object.entries(report.sourceInputs)) {
  assert.equal(hash(execFileSync("git",["show",`${report.sourceCommit}:${filename}`],{cwd:root,maxBuffer:16*1024*1024})),digest,filename);
}
assert.deepEqual(report.platforms.map(p=>p.id).sort(),["darwin-arm64","linux-arm64","linux-x64","win32-x64"]);
for (const platform of report.platforms) {
  assert.equal(platform.classification,"fixture-pass");
  assert.equal(platform.log,platform.id+".log");
  assert.match(platform.compilerFrontendSha256,/^[a-f0-9]{64}$/);
  const log=fs.readFileSync(path.join(__dirname,platform.log),"utf8");
  assert.equal(hash(log),platform.logSha256,platform.id);
  assert.match(log,/pass 1/); assert.match(log,/fail 0/);
  const rows=log.split("\n").filter(line=>line.startsWith("{")).map(line=>JSON.parse(line));
  assert.deepEqual(rows.find(row=>row.seaFixtures)?.seaFixtures,platform.fixtures);
  assert.deepEqual(rows.find(row=>row.packs),platform.routing);
  assert.equal(platform.routing.packs,2);
  assert.equal(platform.routing.numericalPublicAutoloadWithoutExactPack,true);
  assert.equal(platform.routing.seaResourceExtractionWithoutExactPack,true);
  assert.equal(platform.routing.corruptManifestsRejected,6);
  assert.equal(platform.routing.exactBits,202);
  const [valid,invalid]=platform.fixtures;
  assert.equal(valid.scenario,"valid"); assert.equal(invalid.scenario,"invalid");
  assert.equal(valid.result.platform+"-"+valid.result.arch,platform.id);
  assert.equal(valid.result.sea,true); assert.equal(valid.result.sum,1);
  assert.equal(valid.result.exactPackExtracted,false);
  assert.equal(invalid.result.sea,true); assert.equal(invalid.result.invalidManifestRejected,true);
  for (const fixture of platform.fixtures) {
    assert.ok(Number.isSafeInteger(fixture.executableBytes)&&fixture.executableBytes>0);
    assert.match(fixture.executableSha256,/^[a-f0-9]{64}$/);
  }
}
console.log("Four-platform executable native-pack fixture receipts verified (not full product qualification).");

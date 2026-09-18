#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const host = require("./row18_phase6_resident_host.cjs");
const source = require("./row18_phase6_resident_source.cjs");

async function main() {
  const input = process.argv[2];
  assert(input, "usage: row18_phase6_resident_check.cjs PREPARED_JSON");
  const prepared = JSON.parse(fs.readFileSync(input, "utf8"));
  const emitted = source.emitSource();
  assert.equal(emitted.initial.length, 351);
  assert.equal(emitted.retry.length, 317);
  assert.equal(emitted.extraBuffers.length, 38);
  assert.equal(emitted.retryStorage.length, 26);
  assert.doesNotMatch(emitted.source, /deepcopy|inspect|subprocess|open\(/);
  assert.match(emitted.source, /@native\s+def pari_row18_phase6_resident_root/);
  const changed = structuredClone(prepared);
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  await assert.rejects(() => host.prepareResident(changed));
  const resident = await host.prepareResident(prepared);
  const invocation = host.prepareInvocation(resident);
  const sample = host.runInvocation(resident, invocation);
  assert.equal(sample.executionBoundary.nativeCallsInsideClock, 1);
  assert.equal(sample.projection.classGroup.classNumber, "18");
  assert.deepEqual(sample.projection.classGroup.invariantFactors, ["18"]);
  assert.equal(sample.projection.unitGroup.rank, "1");
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row18-phase6-resident-check-v1",
    preparedAuthoritySha256: resident.preparedAuthoritySha256,
    sourceSha256: resident.sourceSha256,
    aggregateAbiOwners: resident.abi.length,
    extraRetryBuffers: emitted.extraBuffers.length + emitted.retryStorage.length,
    changedPreparedAuthorityRejected: true,
    sample,
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

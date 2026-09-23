#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const adapter = require("./row14_pari_prepared_timing_adapter.cjs");

function rejectSample(sample, mutate, pattern) {
  const changed = structuredClone(sample);
  mutate(changed);
  assert.throws(() => adapter.validateSample(changed), pattern);
}

async function main() {
  const receipt = await adapter.runPariBaseline({ samples: 2, seed: "1" });
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.ratioPublished, false);
  assert.deepEqual(receipt.alternatingProtocol.orders, [
    ["sagejs", "pari", "pari", "sagejs"],
    ["pari", "sagejs", "sagejs", "pari"],
  ]);
  assert.equal(receipt.provenance.archiveSha256, adapter.ARCHIVE_SHA256);
  assert.equal(receipt.provenance.buch2Sha256, adapter.BUCH2_SHA256);
  assert.match(receipt.provenance.librarySha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.provenance.executableSha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.provenance.toolchainSha256, /^[0-9a-f]{64}$/);
  assert(receipt.samples.every(sample => BigInt(sample.kernelNanoseconds) > 0n));

  const client = new adapter.HelperClient(adapter.buildHelper());
  await client.ready();
  let sample;
  try {
    sample = await client.run("1");
  } finally {
    await client.close();
  }
  const projection = adapter.matchedProjection(sample);
  assert.deepEqual(projection.classGroup, {
    classNumber: "192", invariantFactors: ["8", "24"], generatorCount: "2",
  });
  assert.deepEqual(projection.unitGroup, {
    rank: "2", regulatorPresent: true, torsionOrder: "2",
    flagZeroStatus: "not_given(LARGE)",
  });

  const calls = [];
  const synthetic = await adapter.runAlternatingCampaign({
    pairCount: 7,
    executeArm: async request => {
      calls.push(`${request.pairIndex}:${request.implementation}`);
      return {
        implementation: request.implementation,
        kernelNanoseconds: String(100 + request.position),
        matchedProjection: projection,
      };
    },
  });
  assert.equal(synthetic.ratioPublished, false);
  assert.equal(synthetic.qualifiedTiming, false);
  assert.equal(synthetic.pairs.length, 7);
  assert.deepEqual(calls.slice(0, 8), [
    "0:sagejs", "0:pari", "0:pari", "0:sagejs",
    "1:pari", "1:sagejs", "1:sagejs", "1:pari",
  ]);
  await assert.rejects(adapter.runAlternatingCampaign({
    pairCount: 6, executeArm: async () => null,
  }), /seven/);
  await assert.rejects(adapter.runAlternatingCampaign({
    pairCount: 7,
    executeArm: async request => ({
      implementation: request.implementation,
      kernelNanoseconds: "1",
      matchedProjection: request.position === 3
        ? { ...projection, terminalStatus: "forged" } : projection,
    }),
  }), /same matched result/);

  rejectSample(sample, value => { value.kernelNanoseconds = "0"; }, /positive/);
  rejectSample(sample, value => { value.result.classGroup.classNumber = "191"; }, /192/);
  rejectSample(sample, value => {
    value.result.classGroup.invariantFactorsSourceOrder.reverse();
  }, /24|deep-equal/);
  rejectSample(sample, value => {
    value.result.classGroup.generatorIdealHnfs[0][0][0] = "01";
  }, /canonical/);
  rejectSample(sample, value => {
    value.result.unitGroup.logEmbeddingColumnMajor.pop();
  }, /6/);
  rejectSample(sample, value => {
    value.result.unitGroup.regulatorTriplet[0] = "x";
  }, /match|regular expression/);
  rejectSample(sample, value => { value.result.unitGroup.torsionOrder = "1"; }, /2/);
  rejectSample(sample, value => {
    value.result.unitGroup.flagZeroFundamentalUnits.status = "materialized";
  }, /deep-equal/);
  rejectSample(sample, value => { value.work.factorBaseSize = "798"; }, /799/);
  rejectSample(sample, value => { value.rng.terminalState[0] = "-1"; }, /canonical/);
  rejectSample(sample, value => { value.result.terminal.publicCertified = true; }, /deep-equal/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-pari-prepared-timing-check-v1",
    pariVersion: receipt.provenance.pariVersion,
    fieldId: adapter.FIELD_ID,
    preparationNanoseconds: receipt.preparation.preparationNanoseconds,
    kernelNanoseconds: receipt.samples.map(value => value.kernelNanoseconds),
    processMaxRssKiB: receipt.samples.map(value => value.processMaxRssKiB),
    semanticRecordSha256: receipt.semanticRecordSha256,
    matchedProjectionSha256: receipt.matchedProjectionSha256,
    toolchainSha256: receipt.provenance.toolchainSha256,
    negativeCases: 13,
    ratioPublished: false,
    qualifiedTiming: false,
  }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

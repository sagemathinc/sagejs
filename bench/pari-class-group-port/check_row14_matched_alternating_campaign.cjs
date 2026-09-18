#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const campaign = require("./row14_matched_alternating_campaign.cjs");

function arm(implementation, ordinal, duration, projection = "a".repeat(64)) {
  return {
    implementation, kernelNanoseconds: String(duration),
    freshComputationOrdinal: String(ordinal), exactOutputAdmission: true,
    matchedProjectionSha256: projection,
    semanticRecordSha256: "b".repeat(64),
  };
}

function syntheticReceipt() {
  let ordinal = 0;
  const pairs = Array.from({ length: 11 }, (_, pairIndex) => {
    const order = campaign.alternatingOrder(pairIndex);
    return { pairIndex, order, arms: order.map(implementation =>
      arm(implementation, ++ordinal,
        implementation === "sagejs" ? 91_000_000_000n : 2_000_000_000n)) };
  });
  return {
    schema: campaign.SCHEMA, pairCount: 11, schedule: "ABBA/BAAB",
    authority: { cpu: "3", cpusAllowedList: "3" },
    matchedProjectionSha256: "a".repeat(64), pairs,
    summary: campaign.summarizeArms(pairs),
    row14BoundaryQualified: true, fullPanelQualified: false,
  };
}

assert.deepEqual(campaign.parseCpuList("0,2-4,4"), [0, 2, 3, 4]);
assert.throws(() => campaign.parseCpuList("4-2"), /invalid/);
assert.deepEqual(campaign.alternatingOrder(0), ["sagejs", "pari", "pari", "sagejs"]);
assert.deepEqual(campaign.alternatingOrder(1), ["pari", "sagejs", "sagejs", "pari"]);
const receipt = syntheticReceipt();
campaign.validateReceipt(receipt);
assert.equal(receipt.summary.samplesPerImplementation, "22");
assert.equal(receipt.summary.medianRatioDecimal, "45.500000");

for (const [name, mutate] of [
  ["pair count", value => { value.pairCount = 10; }],
  ["order", value => { value.pairs[1].order[0] = "sagejs"; }],
  ["duration", value => { value.pairs[0].arms[0].kernelNanoseconds = "999999999"; }],
  ["freshness", value => { value.pairs[0].arms[0].freshComputationOrdinal = "2"; }],
  ["projection", value => {
    value.pairs[0].arms[0].matchedProjectionSha256 = "c".repeat(64);
  }],
  ["admission", value => { value.pairs[0].arms[0].exactOutputAdmission = false; }],
  ["summary", value => { value.summary.pariMedianNanoseconds = "1"; }],
  ["affinity", value => { value.authority.cpusAllowedList = "3-4"; }],
  ["row qualification", value => { value.row14BoundaryQualified = false; }],
  ["panel qualification", value => { value.fullPanelQualified = true; }],
]) {
  const changed = structuredClone(receipt);
  mutate(changed);
  assert.throws(() => campaign.validateReceipt(changed), undefined, name);
}

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/row14-matched-alternating-campaign-check-v1",
  pairs: receipt.pairCount,
  arms: receipt.pairs.length * 4,
  samplesPerImplementation: receipt.summary.samplesPerImplementation,
  rejectedMutations: 10,
  longSeriesExecuted: false,
}, null, 2)}\n`);

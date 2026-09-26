#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  validateReceipt,
} = require("./h1_complete_matched_diagnostic.cjs");
const {
  matchedResult,
  rootSpecification,
} = require("./h1_unified_complete_adapter.cjs");

const specification = rootSpecification();
assert.equal(specification.residentNames.length, 351);
assert.equal(specification.names.length, 564);
assert(specification.names.some(([name]) => name === "precision_resource_cap"));
assert(specification.names.some(([name]) => name === "final_state"));

const result = matchedResult();
assert.deepEqual(result.field.polynomialAscending, ["20034", "-20018", "0", "1"]);
assert.deepEqual(result.classGroup, {
  classNumber: "1", invariantFactors: [], generatorCount: "0",
});
assert.deepEqual(result.unitGroup, {
  rank: "2", torsionOrder: "2",
  torsionGeneratorPowerBasis: ["-1", "0", "0"],
  regulatorPresent: true,
});
assert.equal(result.assumptions.publicComplete, false);

let checkedReceipt = false;
if (process.argv[2]) {
  const envelope = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  assert.equal(envelope.schema,
    "sagejs.pari-class-group/real-complete-h1-matched-run-v1");
  assert.equal(envelope.diagnosticOnly, true);
  assert.equal(envelope.qualifiedTiming, false);
  assert.equal(envelope.finalTimingRun, false);
  assert.equal(envelope.boundaryQualification, "unqualified-development-host");
  assert.equal(envelope.stageAttribution.sagejsInternalHooksAvailable, false);
  assert.equal(envelope.stageAttribution.pariInternalHooksAvailable, false);
  validateReceipt(envelope.diagnosticReceipt);
  assert(envelope.diagnosticReceipt.pairs.length >= 7);
  for (const pair of envelope.diagnosticReceipt.pairs) {
    assert.equal(pair.arms[0].resultDigest, pair.arms[1].resultDigest);
    for (const arm of pair.arms) {
      assert.equal(arm.stageHooks["relation-retry"], false);
      assert.equal(arm.stageHooks["sparse-hnf-snf-transform"], false);
      assert.equal(arm.stageHooks["unit-regulator"], false);
      assert.equal(arm.stageHooks["honesty-generators-final"], false);
      assert.equal(
        arm.stageTotalsNanoseconds["unattributed-remainder"],
        arm.rootNanoseconds,
      );
    }
  }
  checkedReceipt = true;
}

console.log(JSON.stringify({
  schema: "sagejs.pari-class-group/complete-h1-real-runner-check-v1",
  rootParameters: specification.names.length,
  residentParameters: specification.residentNames.length,
  commonResultProjection: true,
  wholeRootResidualOnly: true,
  realReceiptChecked: checkedReceipt,
  qualifiedTiming: false,
  finalTimingRun: false,
}, null, 2));

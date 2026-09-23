#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true
// sagejs-test-platform: true

const assert = require("node:assert/strict");
const {
  FIELD_ID,
  runMatchedDiagnostic,
  validateReceipt,
} = require("./h1_complete_matched_diagnostic.cjs");

const DIGEST = "a".repeat(64);
const stages = [
  "relation-retry", "sparse-hnf-snf-transform", "unit-regulator",
  "honesty-generators-final", "unattributed-remainder",
];

function stageObject(fill) {
  return Object.fromEntries(stages.map(stage => [stage, fill(stage)]));
}

function sageArm(preparedInputSha256) {
  return {
    repetitions: 2,
    preparedInputSha256,
    rootNanoseconds: "200",
    segments: [
      { ordinal: 0, stage: "unattributed-remainder", startNanoseconds: "0", endNanoseconds: "10" },
      { ordinal: 1, stage: "unit-regulator", startNanoseconds: "10", endNanoseconds: "50" },
      { ordinal: 2, stage: "unattributed-remainder", startNanoseconds: "50", endNanoseconds: "60" },
      { ordinal: 3, stage: "honesty-generators-final", startNanoseconds: "60", endNanoseconds: "80" },
      { ordinal: 4, stage: "unattributed-remainder", startNanoseconds: "80", endNanoseconds: "200" },
    ],
    stageTotalsNanoseconds: {
      "relation-retry": "0", "sparse-hnf-snf-transform": "0",
      "unit-regulator": "40", "honesty-generators-final": "20",
      "unattributed-remainder": "140",
    },
    stageHooks: {
      "relation-retry": false, "sparse-hnf-snf-transform": false,
      "unit-regulator": true, "honesty-generators-final": true,
    },
    stageCounters: {
      "relation-retry": {}, "sparse-hnf-snf-transform": {},
      "unit-regulator": {
        unitAttempts: "4", acceptedUnits: "2", regulatorEvaluations: "3",
      },
      "honesty-generators-final": {
        honestyChecks: "1", generatorChecks: "1", replayChecks: "1",
        publications: "1",
      },
    },
    resultDigest: DIGEST, replayDigest: DIGEST, rngDigest: DIGEST,
    workDigest: DIGEST,
    terminalStatus: "pari-correspondence-complete-internal-h1",
  };
}

function pariArm(preparedInputSha256) {
  return {
    repetitions: 4,
    preparedInputSha256,
    rootNanoseconds: "200",
    segments: [{
      ordinal: 0, stage: "unattributed-remainder",
      startNanoseconds: "0", endNanoseconds: "200",
    }],
    stageTotalsNanoseconds: stageObject(stage =>
      stage === "unattributed-remainder" ? "200" : "0"),
    stageHooks: Object.fromEntries(stages.slice(0, 4).map(stage => [stage, false])),
    stageCounters: Object.fromEntries(stages.slice(0, 4).map(stage => [stage, {}])),
    resultDigest: DIGEST, replayDigest: DIGEST, rngDigest: DIGEST,
    workDigest: DIGEST,
    terminalStatus: "pari-correspondence-complete-internal-h1",
  };
}

(async () => {
  const preparedInput = {
    schema: "sagejs.pari-class-group/sanitized-prepared-h1-v1",
    fieldId: FIELD_ID,
    names: [["prep_polynomial", "IntegerBuffer"]],
    input: { prep_polynomial: ["20034", "-20018", "0", "1"] },
  };
  const calls = [];
  const receipt = await runMatchedDiagnostic({
    preparedInput,
    seed: "20260917",
    pairCount: 7,
    executeArm: async request => {
      calls.push(`${request.pairIndex}:${request.implementation}`);
      assert.equal(request.preparedInputSha256,
        require("./h1_complete_matched_diagnostic.cjs").digest(request.preparedInput));
      return request.implementation === "sagejs"
        ? sageArm(request.preparedInputSha256)
        : pariArm(request.preparedInputSha256);
    },
  });
  assert.equal(validateReceipt(receipt), receipt);
  assert.deepEqual(calls, [
    "0:sagejs", "0:pari", "1:pari", "1:sagejs", "2:sagejs", "2:pari",
    "3:pari", "3:sagejs", "4:sagejs", "4:pari", "5:pari", "5:sagejs",
    "6:sagejs", "6:pari",
  ]);
  assert.equal(receipt.summary.attributedGapFraction, 0.6);
  for (const pair of receipt.summary.pairAttributions) {
    assert.equal(pair.commonDenominator, "8");
    assert.equal(pair.rootGapNumerator, "400");
    assert.equal(pair.namedPositiveGapNumerator, "240");
    assert.equal(pair.residualPositiveGapNumerator, "160");
  }

  function rejected(label, mutate) {
    const changed = structuredClone(receipt);
    mutate(changed);
    assert.throws(() => validateReceipt(changed), undefined, label);
  }
  rejected("too few pairs", changed => changed.pairs.pop());
  rejected("nonalternating order", changed => changed.pairs[1].order = "AB");
  rejected("prepared boundary changed", changed => changed.rootBoundary = "polynomial-input");
  rejected("prepared digest differs", changed => changed.pairs[0].arms[0].preparedInputSha256 = "b".repeat(64));
  rejected("result differs", changed => changed.pairs[0].arms[0].resultDigest = "b".repeat(64));
  rejected("gap", changed => changed.pairs[0].arms[0].segments[1].startNanoseconds = "11");
  rejected("double count", changed => changed.pairs[0].arms[0].stageTotalsNanoseconds["unit-regulator"] = "41");
  rejected("unhooked time", changed => changed.pairs[0].arms[0].stageHooks["unit-regulator"] = false);
  rejected("PARI hook", changed => {
    const arm = changed.pairs[0].arms.find(value => value.implementation === "pari");
    arm.stageHooks["relation-retry"] = true;
  });
  rejected("migrated counter", changed => {
    changed.pairs[0].arms[0].stageCounters["unit-regulator"].publications = "1";
  });
  rejected("forged attribution", changed => changed.summary.attributedGapFraction = 1);
  rejected("final timing claim", changed => changed.finalTimingRun = true);
  rejected("qualification claim", changed => changed.qualifiedTiming = true);

  await assert.rejects(runMatchedDiagnostic({
    preparedInput, seed: "1", pairCount: 6, executeArm: async () => null,
  }), /pairCount|false|minimum|>=/);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/complete-h1-matched-diagnostic-check-v1",
    pairCount: receipt.pairs.length,
    armCount: calls.length,
    attributedGapFraction: receipt.summary.attributedGapFraction,
    partialSageHooks: ["unit-regulator", "honesty-generators-final"],
    pariWholeRootOnly: true,
    negativeCases: 14,
    finalTimingRun: false,
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

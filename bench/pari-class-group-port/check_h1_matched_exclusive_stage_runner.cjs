#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  FIELD_ID,
  FROZEN_INPUT_FILE_SHA256,
  FROZEN_PREPARED_INPUT_SHA256,
  MATCHED_KEYS,
  STAGES,
  deriveSummary,
  digest,
  sageArm,
  segmentsFromDurations,
  validateExclusiveArm,
  validateReceipt,
} = require("./h1_matched_exclusive_stage_runner.cjs");

function matchedRecords() {
  return {
    result: { fieldId: FIELD_ID, classNumber: "1", unitRank: "2" },
    replay: {
      status: "cold-replay-authenticated",
      resultSha256: "1".repeat(64),
      authoritySha256: "2".repeat(64),
    },
    rng: { seed: "1", terminalStateCompared: false },
    work: { degree: "3", factorBaseSize: "66", unitRank: "2" },
    terminalStatus: "pari-correspondence-complete-internal-h1",
  };
}

function syntheticArm(implementation, offset = 0n) {
  const durations = STAGES.map((stage, index) => ({
    stage,
    nanoseconds: BigInt(index + 1) + offset,
  }));
  const segments = segmentsFromDurations(durations);
  const stageTotalsNanoseconds = Object.fromEntries(
    durations.map(item => [item.stage, String(item.nanoseconds)]),
  );
  const matched = matchedRecords();
  return validateExclusiveArm({
    implementation,
    rootNanoseconds: String(durations.reduce((sum, item) => sum + item.nanoseconds, 0n)),
    segments,
    stageTotalsNanoseconds,
    resultDigest: digest(matched.result),
    replayDigest: digest(matched.replay),
    rngDigest: digest(matched.rng),
    workDigest: digest(matched.work),
    sourceAuthorityDigest: "a".repeat(64),
    terminalStatus: matched.terminalStatus,
  });
}

function syntheticReceipt() {
  const pairs = Array.from({ length: 7 }, (_, pairIndex) => {
    const sagejs = syntheticArm("sagejs", BigInt(pairIndex + 1));
    const pari = syntheticArm("pari", BigInt(pairIndex));
    const arms = pairIndex % 2 === 0 ? [sagejs, pari] : [pari, sagejs];
    return { pairIndex, order: pairIndex % 2 === 0 ? "AB" : "BA", arms };
  });
  const matchedAuthority = Object.fromEntries(
    MATCHED_KEYS.map(key => [key, pairs[0].arms[0][key]]),
  );
  return {
    schema: "sagejs.pari-class-group/h1-matched-exclusive-stage-development-v1",
    diagnosticOnly: true,
    qualifiedTiming: false,
    boundaryQualification: "unqualified-development-host",
    fieldId: FIELD_ID,
    seed: "1",
    inputProvenance: {
      sourcePath: "/tmp/frozen-inputs.json",
      fileSha256: FROZEN_INPUT_FILE_SHA256,
      preparedInputSha256: FROZEN_PREPARED_INPUT_SHA256,
    },
    buildProvenance: {
      commit: "1".repeat(40),
      dirty: false,
      node: process.version,
      platform: "linux-x64",
      rootSourceSha256: "2".repeat(64),
      adapterSourceSha256: "3".repeat(64),
      pariArchiveSha256: "4".repeat(64),
      pariPristineLibrarySha256: "5".repeat(64),
      pariInstrumentedSourceSha256: "6".repeat(64),
      pariDerivativeLibrarySha256: "7".repeat(64),
      pariDerivativeExecutableSha256: "8".repeat(64),
    },
    matchedAuthority,
    pairs,
    summary: deriveSummary(pairs),
  };
}

function rejected(label, mutate, pattern) {
  const receipt = structuredClone(syntheticReceipt());
  mutate(receipt);
  assert.throws(() => validateReceipt(receipt), pattern, label);
}

function main() {
  const adapterSource = fs.readFileSync(
    path.join(__dirname, "h1_unified_complete_adapter.cjs"), "utf8",
  );
  assert.match(adapterSource, /options\.diagnosticStageClock = DIAGNOSTIC_STAGE_CLOCK/);
  assert.match(adapterSource, /diagnosticStageTrace\(\)/);
  assert.match(adapterSource,
    /if \(!preparedState\.built\.diagnosticStageClock\) \{\s*switchStage/);
  const rootSource = fs.readFileSync(
    path.join(__dirname, "pari_unified_complete_h1_root.py"), "utf8",
  );
  for (const stage of [1, 2, 3, 4]) {
    assert.match(rootSource, new RegExp(`diagnostic_stage_switch\\(${stage}\\)`));
  }

  const records = matchedRecords();
  const trace = {
    schema: 1,
    rootNanoseconds: 15n,
    failed: false,
    clockFailed: false,
    totalsNanoseconds: Object.fromEntries(STAGES.map((stage, index) => [
      stage, BigInt(index + 1),
    ])),
    visits: STAGES.map((stage, index) => ({
      ordinal: index + 1,
      stage,
      stageIndex: [
        "unattributed-remainder", "relation-retry",
        "sparse-hnf-snf-transform", "unit-regulator",
        "honesty-generators-final",
      ].indexOf(stage),
      nanoseconds: BigInt(index + 1),
    })),
  };
  const arm = sageArm({
    correspondenceComplete: true,
    ...records,
    diagnosticStageTrace: trace,
  });
  assert.equal(arm.rootNanoseconds, "15");
  assert.equal(arm.segments.length, 5);

  validateReceipt(syntheticReceipt());
  rejected("gap", receipt => {
    receipt.pairs[0].arms[0].segments[1].startNanoseconds = "99";
  }, /gap|overlap/);
  rejected("stage total", receipt => {
    receipt.pairs[0].arms[0].stageTotalsNanoseconds[STAGES[0]] = "99";
  }, /total mismatch/);
  rejected("matched RNG", receipt => {
    receipt.pairs[0].arms[1].rngDigest = "d".repeat(64);
  }, /matched rngDigest differs/);
  rejected("qualification", receipt => {
    receipt.qualifiedTiming = true;
  }, /true !== false|strictly equal/);
  rejected("pair order", receipt => {
    receipt.pairs[1].arms.reverse();
  }, /deep-equal/);
  rejected("prepared input identity", receipt => {
    receipt.inputProvenance.preparedInputSha256 = "d".repeat(64);
  }, /strictly equal/);

  if (process.argv[2]) {
    const recorded = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
    validateReceipt(recorded);
  }

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/h1-matched-exclusive-stage-check-v1",
    sourceTransparentDiagnosticClock: true,
    stages: STAGES,
    gapFreeConservationMutationsRejected: true,
    exactMatchedDigestMutationsRejected: true,
    qualifiedTiming: false,
  }, null, 2));
}

main();

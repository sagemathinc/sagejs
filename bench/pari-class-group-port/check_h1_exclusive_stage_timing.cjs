"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const {
  ExclusiveStageTimer,
  deriveSummary,
  validateReceipt,
} = require("./h1_exclusive_stage_timing.cjs");

const DIGEST = "1".repeat(64);

function fakeClock(offsets) {
  let index = 0;
  return () => {
    assert(index < offsets.length, "fake monotonic clock was exhausted");
    return BigInt(offsets[index++]);
  };
}

function timedArm({ implementation, position, repetitions, perCall, residual }) {
  const scale = BigInt(repetitions);
  const values = [
    BigInt(residual[0]) * scale,
    BigInt(perCall[0]) * scale,
    BigInt(perCall[1]) * scale,
    BigInt(perCall[2]) * scale,
    BigInt(perCall[3]) * scale,
    BigInt(residual[1]) * scale,
  ];
  const offsets = [0n];
  for (const value of values) offsets.push(offsets.at(-1) + value);
  const timer = new ExclusiveStageTimer(fakeClock(offsets));
  timer.begin();
  timer.switchStage("relation-retry");
  timer.switchStage("sparse-hnf-snf-transform");
  timer.switchStage("unit-regulator");
  timer.switchStage("honesty-generators-final");
  timer.switchStage("unattributed-remainder");
  const trace = timer.finish();
  const label = implementation === "sagejs" ? "A" : "B";
  return {
    position,
    label,
    implementation,
    repetitions,
    ...trace,
    timerReadOverheadNanoseconds: "7",
    resultDigest: DIGEST,
    replayDigest: DIGEST,
    rngDigest: DIGEST,
    workDigest: DIGEST,
    terminalStatus: "authentic-internal-unit-correspondence-published",
  };
}

function makePair(pairIndex) {
  const sagejs = timedArm({
    implementation: "sagejs",
    position: pairIndex % 2 === 0 ? 0 : 1,
    repetitions: 2,
    perCall: [400 + pairIndex, 300, 200, 100],
    residual: [40, 110],
  });
  const pari = timedArm({
    implementation: "pari",
    position: pairIndex % 2 === 0 ? 1 : 0,
    repetitions: 3,
    perCall: [200, 250, 150, 100],
    residual: [40, 60],
  });
  const arms = pairIndex % 2 === 0 ? [sagejs, pari] : [pari, sagejs];
  arms.forEach((arm, position) => { arm.position = position; });
  return {
    pairIndex,
    order: pairIndex % 2 === 0 ? "AB" : "BA",
    arms,
  };
}

function makeReceipt() {
  const pairs = Array.from({ length: 7 }, (_, index) => makePair(index));
  return {
    schema: 1,
    qualifiedTiming: false,
    fieldId: "pari-2.17.4:x^3-20018*x+20034",
    rootBoundary: "prepared-nfinit-class-unit-h1",
    timerProtocol: "single-active-stage-contiguous-v1",
    clock: "monotonic-wall-nanoseconds",
    seed: "1",
    provenance: {
      commit: "2".repeat(40),
      dirty: false,
      rootSourceSha256: "3".repeat(64),
      sageGeneratedSha256: "4".repeat(64),
      sageObjectSha256: "5".repeat(64),
      pariLibrarySha256: "6".repeat(64),
      pariExecutableSha256: "7".repeat(64),
    },
    pairs,
    summary: deriveSummary(pairs),
  };
}

const receipt = makeReceipt();
assert.equal(validateReceipt(receipt), receipt);
assert(receipt.summary.attributedGapFraction > 0.85);
assert(receipt.summary.attributedGapFraction < 0.87);
for (const attribution of receipt.summary.pairAttributions) {
  const stageSum = Object.values(attribution.stageGapNumerators)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  assert.equal(stageSum, BigInt(attribution.rootGapNumerator));
  assert.equal(attribution.commonDenominator, "6");
}

function rejected(label, mutate) {
  const changed = structuredClone(receipt);
  mutate(changed);
  assert.throws(() => validateReceipt(changed), undefined, label);
}

rejected("overlap", changed => {
  changed.pairs[0].arms[0].segments[1].startNanoseconds = "39";
});
rejected("gap", changed => {
  changed.pairs[0].arms[0].segments[1].startNanoseconds = "41";
});
rejected("nested double count", changed => {
  changed.pairs[0].arms[0].stageTotalsNanoseconds["relation-retry"] = "1601";
});
rejected("root omission", changed => {
  changed.pairs[0].arms[0].rootNanoseconds = "2201";
});
rejected("missing stage", changed => {
  const arm = changed.pairs[0].arms[0];
  arm.segments[2].stage = "relation-retry";
  arm.stageTotalsNanoseconds["relation-retry"] = "1400";
  arm.stageTotalsNanoseconds["sparse-hnf-snf-transform"] = "0";
});
rejected("forged attributed fraction", changed => {
  changed.summary.attributedGapFraction = 1;
});
rejected("forged stage gap", changed => {
  changed.summary.pairAttributions[0].stageGapNumerators["unit-regulator"] = "999";
});
rejected("nonalternating schedule", changed => {
  changed.pairs[1].order = "AB";
  changed.pairs[1].arms.reverse();
  changed.pairs[1].arms.forEach((arm, position) => { arm.position = position; });
});
rejected("work divergence", changed => {
  changed.pairs[0].arms[0].workDigest = "8".repeat(64);
});
rejected("unsupported qualification claim", changed => {
  changed.qualifiedTiming = true;
});

// No attributed-gap fraction is manufactured when Sage.js has no positive
// root gap. The raw exact stage gaps remain available for diagnosis.
const faster = makePair(0);
const sageArm = faster.arms.find(arm => arm.implementation === "sagejs");
const pariArm = faster.arms.find(arm => arm.implementation === "pari");
sageArm.rootNanoseconds = pariArm.rootNanoseconds;
sageArm.segments = structuredClone(pariArm.segments);
sageArm.stageTotalsNanoseconds = structuredClone(pariArm.stageTotalsNanoseconds);
sageArm.repetitions = pariArm.repetitions;
const noGap = deriveSummary([faster]);
assert.equal(noGap.pairAttributions[0].rootGapNumerator, "0");
assert.equal(noGap.attributedGapFraction, null);

assert.throws(() => {
  const timer = new ExclusiveStageTimer(fakeClock([10, 9]));
  timer.begin();
  timer.switchStage("relation-retry");
}, /backwards/);

console.log(JSON.stringify({
  schema: "sagejs.pari-class-group/h1-exclusive-stage-timing-check-v1",
  pairCount: receipt.pairs.length,
  stageCount: 5,
  namedStageCount: 4,
  attributedGapFraction: receipt.summary.attributedGapFraction,
  negativeCases: 11,
  finalTimingRun: false,
}, null, 2));

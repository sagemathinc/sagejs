#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const diagnostic = require("./row14_unqualified_paired_diagnostic.cjs");

const hex = letter => letter.repeat(64);
let ordinal = 0;
const pairs = Array.from({ length: diagnostic.PAIRS }, (_, pairIndex) => {
  const order = diagnostic.orderFor(pairIndex);
  return { pairIndex, order, arms: order.map(implementation => ({
    implementation, freshComputationOrdinal: String(++ordinal),
    kernelNanoseconds: implementation === "sagejs" ? "2000000000" : "1000000000",
    processLifetimeMaxRssKiB: "1000", exactOutputAdmission: true,
    matchedProjectionSha256: hex("a"), sourceSemanticSha256: hex(implementation === "sagejs" ? "b" : "c"),
    stageTiming: implementation === "sagejs" ? {
      leaves: Object.fromEntries(diagnostic.SAGE_LEAVES.map((name, index) =>
        [name, index === 0 ? "800000000" : "200000000"])),
      residualNanoseconds: "0",
    } : { leaves: {}, residualNanoseconds: "1000000000" },
  })) };
});
const receipt = {
  schema: diagnostic.SCHEMA, diagnosticOnly: true, qualifiedTiming: false,
  finalTimingRun: false, ratioClaimPublished: false, outcomeClaim: null,
  field: { id: diagnostic.FIELD_ID, panelIndex: 14, role: "sentinel" },
  reserveControls: { reserveOpeningEnabled: false, reserveFieldsRead: 0,
    populationDenominatorClaimed: false },
  hostControls: { requestedCpu: "3", cpusAllowedList: "3",
    threadEnvironment: { OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
    quietHostApproved: false, qualificationAuthorityApproved: false },
  boundary: { input: "authenticated prepared nfinit state",
    output: "matched flag-zero class-and-unit semantic projection",
    preparationInsideClock: false, compilationInsideClock: false,
    replayInsideClock: false, serializationInsideClock: false, eachArmFresh: true },
  stageInterpretation: { phase6FourWayAttributionAvailable: false,
    reason: "synthetic", sageLeaves: diagnostic.SAGE_LEAVES,
    pariCharge: "unattributed-remainder" },
  minimumArmNanoseconds: "1000000000", matchedProjectionSha256: hex("a"),
  sourceSemanticSha256: { sagejs: hex("b"), pari: hex("c") }, pairs,
};
diagnostic.validateReceipt(receipt);
diagnostic.requireDevelopmentField();

for (const mutate of [
  value => { value.qualifiedTiming = true; },
  value => { value.ratioClaimPublished = true; },
  value => { value.field.role = "final-reserve"; },
  value => { value.reserveControls.reserveFieldsRead = 1; },
  value => { value.pairs[1].order.reverse(); },
  value => { value.pairs[0].arms[0].kernelNanoseconds = "999999999"; },
  value => { value.pairs[0].arms[0].freshComputationOrdinal = "2"; },
  value => { value.pairs[0].arms[0].matchedProjectionSha256 = hex("d"); },
  value => { value.pairs[0].arms[0].stageTiming.leaves.initialRootAndLiveState = "799999999"; },
  value => { value.stageInterpretation.phase6FourWayAttributionAvailable = true; },
]) {
  const changed = structuredClone(receipt); mutate(changed);
  assert.throws(() => diagnostic.validateReceipt(changed));
}

console.log(JSON.stringify({ schema: `${diagnostic.SCHEMA}-check`, pairs: pairs.length,
  arms: pairs.length * 2, reservesOpened: 0, qualifiedTiming: false,
  rejectedMutations: 10 }, null, 2));

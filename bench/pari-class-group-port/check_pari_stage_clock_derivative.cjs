#!/usr/bin/env node
"use strict";

// Focused semantic and instrumentation-contract check.  This deliberately does
// not claim a final quiet-host timing result.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { instrument, PRISTINE_SHA256, sha256 } = require(
  "./pari-stage-clock/instrument-buch2.cjs",
);
const { buildDerivative, fileSha256 } = require("./pari_stage_clock_derivative.cjs");
const { runCampaign, STAGES } = require("./pari-stage-clock/run-derivative.cjs");
const pariAdapter = require("./pari_h1_outcome_c_adapter.cjs");

async function pristineRecord(seed) {
  // The foreign-library adapter consumes the mathematical prepared nf it
  // constructs before READY. Its JS-side input validation needs only the
  // authenticated identity and polynomial, not Sage.js's unrelated owner ABI.
  const preparedInput = {
    schema: "sagejs.pari-class-group/sanitized-prepared-h1-v1",
    fieldId: pariAdapter.FIELD_ID,
    input: { prep_polynomial: ["20034", "-20018", "0", "1"] },
  };
  const state = await pariAdapter.preparePreparedH1({
    implementation: "pari",
    seed,
    preparedInput,
  });
  try {
    // This is the independent pristine-library process created before the
    // derivative helper; it is exactly the record later used for cold replay.
    return state.replayRecord;
  } finally {
    await pariAdapter.closePreparedH1(state);
  }
}

async function main() {
  const archive = path.resolve(
    process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  const pristineRoot = path.resolve(
    process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4",
  );
  assert.equal(
    fileSha256(path.join(pristineRoot, "src", "basemath", "buch2.c")),
    PRISTINE_SHA256,
    "authority source was modified",
  );
  const pristine = fs.readFileSync(path.join(pristineRoot, "src", "basemath", "buch2.c"), "utf8");
  const transformed = instrument(pristine);
  assert.notEqual(sha256(transformed), PRISTINE_SHA256);
  assert.throws(() => instrument(`${pristine}\n`), /not pristine/);
  assert.throws(() => instrument(transformed), /not pristine|already applied/);
  for (const marker of [
    "SAGEJS_BUCHALL_RELATION_RETRY",
    "SAGEJS_BUCHALL_HNF_SNF_TRANSFORM",
    "SAGEJS_BUCHALL_UNIT_REGULATOR",
    "SAGEJS_BUCHALL_HONESTY_GENERATORS_FINAL",
    "SAGEJS_BUCHALL_UNATTRIBUTED_REMAINDER",
    "sagejs_buchall_stage_clock_segment_count",
  ]) assert(transformed.includes(marker), `${marker} missing`);

  const manifest = buildDerivative({ archive });
  assert.equal(manifest.derivativeOnly, true);
  assert.equal(manifest.mathematicalAuthority, false);
  assert.equal(manifest.input.pristineBuch2Sha256, PRISTINE_SHA256);
  assert.equal(manifest.instrumentedBuch2Sha256, sha256(transformed));
  assert.equal(manifest.pristineCompileArguments.at(-1), manifest.pristineExecutable);
  assert(!manifest.pristineCompileArguments.some(argument => argument.includes("-tmp-")));
  assert.notEqual(manifest.librarySha256, pariAdapter.buildHelper().librarySha256);
  assert.equal(
    manifest.input.pristineLibrarySha256,
    pariAdapter.buildHelper().librarySha256,
  );

  const seed = "1";
  const campaign = await runCampaign({ pairs: 2, repetitions: 1, seed });
  const authority = await pristineRecord(seed);
  assert.deepEqual(campaign.exactRecord, authority, "instrumented PARI changed result/work/RNG");
  assert.equal(
    fileSha256(path.join(pristineRoot, "src", "basemath", "buch2.c")),
    PRISTINE_SHA256,
    "derivative build modified the authority source",
  );
  assert.equal(campaign.qualifiedTiming, false);
  assert.equal(campaign.perturbationGate.evaluated, false);
  assert.equal(campaign.perturbationGate.passed, null);
  assert.deepEqual(
    Object.keys(campaign.rawPairs[0].arms[0].stageTotalsNanoseconds),
    STAGES,
  );
  assert.deepEqual(
    campaign.rawPairs.map(pair => pair.order),
    [
      ["ACTIVE", "PRISTINE", "PRISTINE", "ACTIVE"],
      ["PRISTINE", "ACTIVE", "ACTIVE", "PRISTINE"],
    ],
  );

  const active = campaign.rawPairs.flatMap(pair => pair.arms)
    .filter(arm => arm.mode === "ACTIVE");
  for (const arm of active) {
    for (const sample of arm.samples) {
      const sum = STAGES.reduce(
        (total, stage) => total + BigInt(sample.stageTotalsNanoseconds[stage]),
        0n,
      );
      assert.equal(sum.toString(), sample.inclusiveRootNanoseconds);
    }
  }

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/pari-stage-clock-check-v2",
    pariVersion: "2.17.4",
    archiveSha256: fileSha256(archive),
    pristineBuch2Sha256: PRISTINE_SHA256,
    instrumentedBuch2Sha256: manifest.instrumentedBuch2Sha256,
    pristineLibrarySha256: pariAdapter.buildHelper().librarySha256,
    derivativeLibrarySha256: manifest.librarySha256,
    derivativeExecutableSha256: manifest.executableSha256,
    pristineControlExecutableSha256: manifest.pristineExecutableSha256,
    exactRecordSha256: campaign.exactRecordSha256,
    exactResultWorkRngMatch: true,
    exclusiveConservation: true,
    monotonicClock: true,
    repeatedVisitsObserved: true,
    orderedSegmentsReconstructTotals: true,
    diagnosticMedianActiveOverPristine: campaign.medianActiveOverPristine,
    diagnosticMedianInactiveOverPristine: campaign.medianInactiveOverPristine,
    qualifiedTiming: false,
    perturbationGateDesign: campaign.perturbationGate,
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

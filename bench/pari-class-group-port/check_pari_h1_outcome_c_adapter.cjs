#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  NONZERO_PREPARED_OWNERS,
  SENTINEL_OWNERS,
  parseRootParameters,
  sanitizePreparedInput,
} = require("./h1_outcome_c_adapter.cjs");
const { digest, runWorker } = require("./h1_outcome_c_worker.cjs");
const pariAdapter = require("./pari_h1_outcome_c_adapter.cjs");

const sourceText = fs.readFileSync(
  path.join(__dirname, "resident_generated_class_attempt.py"),
  "utf8",
);
const names = parseRootParameters(sourceText);

function zeroValue(kind) {
  if (kind.endsWith("Buffer")) return [];
  if (kind === "bool") return false;
  if (kind === "float") return 0;
  return "0";
}

const input = Object.fromEntries(names.map(([name, kind]) => [name, zeroValue(kind)]));
for (const [name, kind] of names) {
  if (!NONZERO_PREPARED_OWNERS.has(name)) continue;
  input[name] = kind.endsWith("Buffer")
    ? (kind === "Float64Buffer" ? [1.25] : ["1"])
    : (kind === "float" ? 1.25 : kind === "bool" ? true : "1");
}
input.prep_polynomial = ["20034", "-20018", "0", "1"];
for (const [name, value] of Object.entries(SENTINEL_OWNERS)) input[name] = value;
const prepared = sanitizePreparedInput({ names, input }, sourceText).record;

async function inspectAuthenticResult() {
  const seed = "1";
  const state = await pariAdapter.preparePreparedH1({
    implementation: "pari",
    seed,
    preparedInput: structuredClone(prepared),
  });
  try {
    return await pariAdapter.runPreparedH1({
      implementation: "pari",
      seed,
      preparedInput: structuredClone(prepared),
      preparedState: state,
      switchStage: () => assert.fail("whole-root PARI adapter asserted an internal stage"),
    });
  } finally {
    await pariAdapter.closePreparedH1(state);
  }
}

async function main() {
  assert.equal(pariAdapter.stageMode, "whole-root-only");
  const output = await inspectAuthenticResult();
  assert.equal(output.correspondenceComplete, true);
  assert.equal(output.terminalStatus, "pari-correspondence-complete-internal-h1");
  assert.equal(output.replay.status, "cold-replay-authenticated");
  assert.equal(output.replay.resultSha256, digest(output.result));
  assert.match(output.replay.authoritySha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(output.result.classGroup, {
    classNumber: "1",
    invariantFactors: [],
    generatorIdeals: [],
  });
  assert.equal(output.result.unitGroupCorrespondence.rank, "2");
  assert.deepEqual(output.result.unitGroupCorrespondence.logEmbeddingShape, ["3", "2"]);
  assert.equal(output.result.unitGroupCorrespondence.logEmbeddingColumnMajor.length, 6);
  assert.equal(output.result.unitGroupCorrespondence.expandedFundamentalUnits, null);
  assert.equal(output.result.unitGroupCorrespondence.torsionOrder, "2");
  assert.deepEqual(
    output.result.unitGroupCorrespondence.torsionGeneratorPowerBasis,
    ["-1", "0", "0"],
  );
  assert.deepEqual(output.work, {
    schema: "sagejs.pari-class-group/h1-source-work-v1",
    degree: "3",
    factorBaseSize: "66",
    retainedClassRows: "0",
    logEmbeddingRows: "3",
    logEmbeddingColumns: "2",
  });
  assert.equal(output.rng.algorithm, "pari-xorshift1024star-2.17.4");
  assert.equal(output.rng.seed, "1");
  assert.equal(output.rng.terminalState.length, 66);

  const request = {
    schema: 1,
    fieldId: pariAdapter.FIELD_ID,
    seed: "1",
    pairIndex: 0,
    repetitions: 2,
    implementation: "pari",
    preparedInputSha256: digest(prepared),
    preparedInput: prepared,
  };
  const response = await runWorker({
    request,
    implementation: "pari",
    adapterPath: path.join(__dirname, "pari_h1_outcome_c_adapter.cjs"),
    clock: process.hrtime.bigint,
  });
  assert.equal(response.selfTestClock, false, "authentic adapter used a synthetic clock");
  assert.equal(response.arm.repetitions, 2);
  assert(BigInt(response.arm.rootNanoseconds) > 0n);
  assert.equal(
    response.arm.stageTotalsNanoseconds["unattributed-remainder"],
    response.arm.rootNanoseconds,
  );
  for (const stage of [
    "relation-retry", "sparse-hnf-snf-transform", "unit-regulator",
    "honesty-generators-final",
  ]) assert.equal(response.arm.stageTotalsNanoseconds[stage], "0");
  assert.equal(response.arm.resultDigest, digest(output.result));
  assert.equal(response.arm.replayDigest, digest(output.replay));
  assert.equal(response.arm.rngDigest, digest(output.rng));
  assert.equal(response.arm.workDigest, digest(output.work));

  const wrongPolynomial = structuredClone(prepared);
  wrongPolynomial.input.prep_polynomial[0] = "20035";
  await assert.rejects(
    pariAdapter.preparePreparedH1({
      implementation: "pari",
      seed: "1",
      preparedInput: wrongPolynomial,
    }),
    /prepared polynomial changed/,
  );

  const build = pariAdapter.buildHelper();
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/pari-h1-outcome-c-adapter-check-v1",
    pariVersion: "2.17.4",
    fieldId: pariAdapter.FIELD_ID,
    preparation: "nfinit-outside-root",
    timedKernel: "bnfinit-prepared-nf-flag-zero-plus-standardization",
    stageCoverage: pariAdapter.stageMode,
    syntheticClock: response.selfTestClock,
    repetitions: response.arm.repetitions,
    rootNanoseconds: response.arm.rootNanoseconds,
    resultDigest: response.arm.resultDigest,
    replayDigest: response.arm.replayDigest,
    rngDigest: response.arm.rngDigest,
    workDigest: response.arm.workDigest,
    sourceSha256: build.sourceSha256,
    librarySha256: build.librarySha256,
    executableSha256: build.executableSha256,
    finalTimingRun: false,
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");

const host = require("./row14_matched_kernel_clock_host.cjs");
const pari = require("./row14_pari_prepared_timing_adapter.cjs");
const timing = require("./row14_sage_prepared_timing_adapter.cjs");

function projection(result) {
  const flat = result.klass.generators.map(String);
  const ideals = Array.from({ length: 2 }, (_, ideal) =>
    Array.from({ length: 4 }, (_, row) =>
      flat.slice(16 * ideal + 4 * row, 16 * ideal + 4 * row + 4)));
  const packed = result.units.archimedeanUnits.map(String);
  return {
    schema: "sagejs.pari-class-group/row14-sage-semantic-projection-v1",
    field: { id: timing.FIELD_ID, polynomialAscending: timing.POLYNOMIAL },
    classGroup: { classNumber: String(result.klass.classNumber),
      invariantFactors: result.klass.invariants.map(String).reverse(),
      generatorIdealHnfs: ideals },
    unitGroup: { rank: "2", regulatorInternalTriplet: result.units.regulator.map(String),
      logEmbeddingInternalTriplets: Array.from({ length: 6 }, (_, index) =>
        packed.slice(7 * index + 1, 7 * index + 4)), torsionOrder: "2",
      torsionGeneratorPowerBasis: ["-1", "0", "0", "0"],
      flagZeroStatus: "not_given(LARGE)" },
    work: { degree: "4", factorBaseSize: "799", classHnfColumns: "3",
      logEmbeddingRows: "3", logEmbeddingColumns: "2" },
    rng: { algorithm: "pari-xorshift1024star-2.17.4", seed: "1",
      terminalState: result.root.rng.map(String) },
    terminalStatus: "pari-correspondence-complete-internal",
  };
}

function exerciseSemanticMutations(sage, sample) {
  const mutations = [
    value => { value.classGroup.classNumber = "193"; },
    value => { value.classGroup.generatorIdealHnfs[0][0][0] = "5100"; },
    value => { value.unitGroup.regulatorInternalTriplet[0] = "1"; },
    value => { value.unitGroup.logEmbeddingInternalTriplets[0] = ["1", "1", "0"]; },
    value => { value.rng.terminalState[0] = "0"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(sage);
    mutate(changed);
    assert.throws(() => timing.compareWithPari(changed, sample));
  }
  return mutations.length;
}

async function main() {
  // Sample PARI before loading the large Sage.js native graphs; the two clocks
  // remain mutually exclusive and the 4-GiB cap is then meaningful per arm.
  const client = new pari.HelperClient(pari.buildHelper());
  await client.ready();
  let sample;
  try { sample = await client.run("1"); } finally { await client.close(); }
  const authenticated = timing.authenticatePrepared();
  const resident = await host.prepareResident(authenticated.prepared);
  const result = await host.runResident(resident);
  assert.equal(result.executionBoundary.compilationInsideRun, false);
  assert.equal(result.executionBoundary.residentHandleCount, 4);
  const sage = projection(result);
  const comparison = timing.compareWithPari(sage, sample);
  assert.equal(comparison.exactGeneratorIdeals, true);
  assert.equal(comparison.exactRegulatorValue, true);
  assert.equal(comparison.exactRngState, true);
  assert(comparison.minimumLogAgreementBits >= 96);
  const rejectedSemanticMutations = exerciseSemanticMutations(sage, sample);
  const stageTotal = Object.values(result.stageNanoseconds)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  assert.equal(stageTotal, BigInt(result.kernelNanoseconds));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-matched-kernel-clock-check-v1",
    boundary: {
      input: "authenticated prepared nfinit state",
      output: "flag-zero class generators, units/logs, regulator, torsion and terminal work state",
      residentProcess: true, subprocessesInsideClock: false,
      filesystemInsideClock: false, ownerHashingInsideClock: false,
      replayInsideClock: false, publicationInsideClock: false,
    },
    sageKernelNanoseconds: result.kernelNanoseconds,
    pariKernelNanoseconds: sample.kernelNanoseconds,
    sageStageNanoseconds: result.stageNanoseconds,
    executionBoundary: result.executionBoundary,
    sageMaximumRssKiB: String(result.maxRssKiB),
    pariMaximumRssKiB: sample.processMaxRssKiB,
    comparison, rejectedSemanticMutations,
    qualifiedTiming: false, ratioPublished: false,
    reason: "single exact-boundary proof; alternating campaign has not run",
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

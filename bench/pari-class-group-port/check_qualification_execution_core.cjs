#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const core = require("./qualification_execution_core.cjs");
const sealed = require("./run_class_unit_qualification.cjs");

const STAGES = {
  relationRetry: "50000000",
  sparseHnfSnfTransform: "100000000",
  unitRegulator: "100000000",
  honestyGeneratorsFinal: "50000000",
};

function adapter(implementation, kernelNanoseconds) {
  const calls = [];
  return {
    implementation,
    calls,
    async warmup(request) { calls.push({ kind: "warmup", ...request }); },
    async runFresh(request) {
      calls.push({ kind: "run", ...request });
      const used = Object.values(STAGES).reduce((sum, value) => sum + BigInt(value), 0n);
      return {
        kernelNanoseconds,
        threadCpuNanoseconds: String(BigInt(kernelNanoseconds) - 1n),
        peakRssKiB: implementation === "sagejs" ? "1000" : "500",
        output: { classGroup: ["2", "2"], unitRank: "2" },
        replay: { exact: true, witnesses: "2" },
        rng: { algorithm: "test", terminal: ["1", "2"] },
        counters: { relations: "1137", retries: "0" },
        resourceCounters: { allocations: implementation === "sagejs" ? "2" : "1" },
        stageTiming: {
          inclusiveNanoseconds: kernelNanoseconds,
          leaves: STAGES,
          unattributedNanoseconds: String(BigInt(kernelNanoseconds) - used),
        },
      };
    },
  };
}

async function main() {
  const sagejs = adapter("sagejs", "600000000");
  const pari = adapter("pari", "400000000");
  const result = await core.runAlternatingSuccessPath({
    adapters: { sagejs, pari },
    boundary: "prepared-kernel",
    fieldId: "synthetic-qualified-shape",
    seed: "1",
    tier: "flag-zero",
  });
  assert.equal(result.qualifiedTiming, false);
  assert.deepEqual(result.repetitionsByImplementation, { sagejs: 2, pari: 4 });
  assert.equal(result.calibration.sagejs.doublingGeneration, 1);
  assert.equal(result.calibration.pari.doublingGeneration, 2);
  assert.equal(result.blocks.length, 11);
  assert.deepEqual(result.blocks.map(block => block.order), [
    "ABBA", "BAAB", "ABBA", "BAAB", "ABBA", "BAAB",
    "ABBA", "BAAB", "ABBA", "BAAB", "ABBA",
  ]);
  assert.deepEqual(result.blocks[0].arms.map(arm => arm.implementation),
    ["sagejs", "pari", "pari", "sagejs"]);
  assert.deepEqual(result.blocks[1].arms.map(arm => arm.implementation),
    ["pari", "sagejs", "sagejs", "pari"]);
  assert.equal(result.blocks[0].arms[0].wallNanoseconds, "1200000000");
  assert.equal(result.blocks[0].arms[1].wallNanoseconds, "1600000000");
  assert.equal(result.stageBlocks[0].arms[0].stageTiming.inclusiveNanoseconds,
    result.blocks[0].arms[0].wallNanoseconds);
  assert.equal(Object.values(result.commonDigests).every(value =>
    /^[0-9a-f]{64}$/.test(value)), true);
  assert.equal(sagejs.calls[0].kind, "warmup");
  assert.equal(pari.calls[0].kind, "warmup");

  const manifestData = sealed.validateManifest();
  const sealedReceipt = sealed.syntheticReceipt(manifestData.manifest.fields[0], {
    manifestData,
  });
  sealedReceipt.case.repetitionsByImplementation = result.repetitionsByImplementation;
  sealedReceipt.case.calibration = {
    excludedFromTiming: true,
    targetNanoseconds: "1000000000",
    doublingGeneration: Math.max(result.calibration.sagejs.doublingGeneration,
      result.calibration.pari.doublingGeneration),
  };
  sealedReceipt.blocks = result.blocks;
  sealedReceipt.summary.fieldSlowdown = 1.5;
  sealedReceipt.summary.referenceSecondsPerCall = 0.4;
  assert.doesNotThrow(() => sealed.validateReceipt(sealedReceipt, { manifestData }));

  const malformed = adapter("sagejs", "600000000");
  malformed.runFresh = async request => {
    const sample = await adapter("sagejs", "600000000").runFresh(request);
    sample.stageTiming.unattributedNanoseconds = "1";
    return sample;
  };
  await assert.rejects(core.runAlternatingSuccessPath({
    adapters: { sagejs: malformed, pari: adapter("pari", "400000000") },
    boundary: "prepared-kernel", fieldId: "bad-stage", seed: "1", tier: "diagnostic",
  }), /leaves plus remainder/);

  let changed = 0;
  const divergent = adapter("pari", "400000000");
  divergent.runFresh = async request => {
    const sample = await adapter("pari", "400000000").runFresh(request);
    changed += 1;
    if (changed > 4) sample.output.classGroup = ["4"];
    return sample;
  };
  await assert.rejects(core.runAlternatingSuccessPath({
    adapters: { sagejs: adapter("sagejs", "600000000"), pari: divergent },
    boundary: "prepared-kernel", fieldId: "bad-output", seed: "1", tier: "diagnostic",
  }), /changed outputDigest/);

  await assert.rejects(core.runAlternatingSuccessPath({
    adapters: { sagejs: adapter("sagejs", "600000000"), pari: adapter("pari", "400000000") },
    boundary: "prepared-kernel", fieldId: "subsecond", seed: "1", tier: "diagnostic",
    minimumArmNanoseconds: 999999999n,
  }), /less than one second/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/qualification-execution-core-check-v1",
    blocks: result.blocks.length,
    arms: result.blocks.reduce((sum, block) => sum + block.arms.length, 0),
    sagejsRepetitions: result.repetitionsByImplementation.sagejs,
    pariRepetitions: result.repetitionsByImplementation.pari,
    exactStageClosure: true,
    crossArmDigestAgreement: true,
    negativeCases: 3,
    qualifiedTiming: false,
  })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

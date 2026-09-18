#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const core = require("./qualification_execution_core.cjs");
const sealed = require("./run_class_unit_qualification.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const roots = require("./phase5_development_roots.cjs");

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

function developmentFixture(root) {
  const owner = (name, role, entries) => ({ capacity: String(entries.length),
    encoding: "canonical-decimal-integer", entries,
    logicalLength: String(entries.length), name, role });
  const payload = {
    classGroup: { classNumber: "1", generatorCount: "0", invariantFactors: [],
      presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: [...root.coefficients], degree: String(root.degree),
      id: root.internalFieldId },
    honesty: { evidenceOwner: null, outcome: "not-required", sourcePolicy: "core-check" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [{ disposition: "assumed", id: "core-check",
      statement: "focused execution-core fixture" }],
    correspondence: "upstream-assumed-pari-correspondence",
    pariSourceSha256: "a".repeat(64), pariVersion: "2.17.4",
    replaySchema: "sagejs.pari-class-group/development-core-check-replay-v1" },
    storage: [
      owner("class-presentation", "class-presentation", ["1"]),
      owner("exact-unit-coordinates", "exact-unit-coordinates",
        Array(root.degree * (root.degree - 1)).fill("0")),
      owner("exact-unit-norms", "exact-unit-norms", Array(root.degree - 1).fill("1")),
      owner("regulator-enclosure", "regulator-enclosure", ["1"]),
      owner("torsion-generator", "torsion-generator",
        ["-1", ...Array(root.degree - 1).fill("0")]),
    ],
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { coordinatesOwner: "exact-unit-coordinates",
      normsOwner: "exact-unit-norms", tag: "exact_units" }, rank: String(root.degree - 1),
    regulatorOwner: "regulator-enclosure", torsionGeneratorOwner: "torsion-generator",
    torsionOrder: "2" },
  };
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const payloadSha256 = neutral.sha256Canonical(payload);
  const mathematicalAuthoritySha256 = "b".repeat(64);
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
    replaySchema: payload.source.replaySchema,
    replay(candidate) { return { correspondence_complete: true, fieldId: candidate.field.id,
      mathematicalAuthoritySha256, payloadSha256, public_complete: false,
      schema: payload.source.replaySchema }; },
  });
  const result = neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  const replay = { schema: "sagejs.pari-class-group/detached-development-replay-v1",
    fieldId: root.manifestFieldId, resultSha256: result.sha256, payloadSha256,
    correspondenceComplete: true, publicComplete: false };
  return { payloadSha256, replay, result };
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

  const developmentRoot = roots.developmentRoot(1);
  const development = developmentFixture(developmentRoot);
  const correctness = await core.runDevelopmentCorrectnessPath({
    root: developmentRoot,
    invoke: async () => ({ result: development.result, replay: development.replay,
      sourceMetadata: { fieldId: developmentRoot.manifestFieldId,
        correspondenceComplete: true, publicComplete: false } }),
  });
  assert.deepEqual(Object.keys(correctness).sort(), [
    "correspondenceComplete", "fieldId", "freshPreparedExecution", "internalFieldId",
    "panelIndex", "payloadSha256", "publicComplete", "qualifiedTiming", "replaySha256",
    "resultSha256", "schema", "terminalStatus",
  ].sort());
  assert.equal(correctness.schema, core.DEVELOPMENT_CORRECTNESS_SCHEMA);
  assert.equal(correctness.resultSha256, development.result.sha256);
  assert.equal(correctness.payloadSha256, development.payloadSha256);
  assert.equal(correctness.qualifiedTiming, false);
  assert.equal(correctness.freshPreparedExecution, false);
  assert.equal(Object.hasOwn(correctness, "wallNanoseconds"), false);
  assert.equal(Object.hasOwn(correctness, "calibration"), false);
  assert.equal(Object.hasOwn(correctness, "blocks"), false);
  const suppliedResult = await core.runDevelopmentCorrectnessPath({
    root: developmentRoot, result: development.result, replay: development.replay,
  });
  assert.deepEqual(suppliedResult, correctness);

  const changedReplay = structuredClone(development.replay);
  changedReplay.payloadSha256 = "0".repeat(64);
  await assert.rejects(core.runDevelopmentCorrectnessPath({ root: developmentRoot,
    result: development.result, replay: changedReplay }), /replay payload digest changed/);
  await assert.rejects(core.runDevelopmentCorrectnessPath({ root: developmentRoot,
    result: {}, replay: development.replay }), /verified neutral result brand/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/qualification-execution-core-check-v1",
    blocks: result.blocks.length,
    arms: result.blocks.reduce((sum, block) => sum + block.arms.length, 0),
    sagejsRepetitions: result.repetitionsByImplementation.sagejs,
    pariRepetitions: result.repetitionsByImplementation.pari,
    exactStageClosure: true,
    crossArmDigestAgreement: true,
    developmentCorrectness: true,
    developmentResultSha256: correctness.resultSha256,
    developmentTimingFields: 0,
    negativeCases: 5,
    qualifiedTiming: false,
  })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

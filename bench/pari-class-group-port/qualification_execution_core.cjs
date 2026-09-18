"use strict";

// Neutral execution core for the sealed class-and-unit qualification contract.
//
// This module deliberately does not select fields, open reserves, acquire the
// timing lock, approve a host, or mark evidence as qualified.  It turns two
// already-authenticated fresh-computation adapters into exact alternating
// blocks suitable for the existing append-only receipt journal.

const assert = require("node:assert/strict");
const {
  ONE_SECOND_NS,
  canonicalDigest,
  finalQualificationSchedule,
  implementationForLabel,
  stageDiagnosticSchedule,
} = require("./run_class_unit_qualification.cjs");

const IMPLEMENTATIONS = Object.freeze(["sagejs", "pari"]);
const PREPARED_STAGE_NAMES = Object.freeze([
  "relationRetry",
  "sparseHnfSnfTransform",
  "unitRegulator",
  "honestyGeneratorsFinal",
]);

function unsigned(value, label, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${label} must be an integer string`);
  assert.match(value, /^(0|[1-9][0-9]*)$/, `${label} is not canonical`);
  const result = BigInt(value);
  if (positive) assert(result > 0n, `${label} must be positive`);
  return result;
}

function counters(value, label) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    assert.match(key, /^[A-Za-z][A-Za-z0-9]*$/, `${label} has an invalid key`);
    unsigned(value[key], `${label}.${key}`);
    result[key] = value[key];
  }
  return result;
}

function validateStageTiming(timing, kernelNanoseconds) {
  assert(timing && typeof timing === "object" && !Array.isArray(timing),
    "prepared-kernel samples require stage timing");
  assert.deepEqual(Object.keys(timing).sort(),
    ["inclusiveNanoseconds", "leaves", "unattributedNanoseconds"].sort());
  assert.deepEqual(Object.keys(timing.leaves).sort(), [...PREPARED_STAGE_NAMES].sort(),
    "prepared stage leaves changed");
  const inclusive = unsigned(timing.inclusiveNanoseconds, "inclusive stage clock", {
    positive: true,
  });
  assert.equal(inclusive, kernelNanoseconds,
    "inclusive stage clock must equal the adapter kernel clock");
  const leafTotal = PREPARED_STAGE_NAMES.reduce((sum, name) =>
    sum + unsigned(timing.leaves[name], `stage ${name}`), 0n);
  const unattributed = unsigned(timing.unattributedNanoseconds,
    "unattributed stage remainder");
  assert.equal(leafTotal + unattributed, inclusive,
    "mutually exclusive leaves plus remainder must equal the inclusive root");
  return {
    inclusiveNanoseconds: String(inclusive),
    leaves: Object.fromEntries(PREPARED_STAGE_NAMES.map(name =>
      [name, String(unsigned(timing.leaves[name], `stage ${name}`))])),
    unattributedNanoseconds: String(unattributed),
  };
}

function validateFreshSample(sample, { implementation, boundary }) {
  assert(sample && typeof sample === "object" && !Array.isArray(sample),
    `${implementation} adapter returned no sample`);
  assert.deepEqual(Object.keys(sample).sort(), [
    "counters", "kernelNanoseconds", "output", "peakRssKiB", "replay",
    "resourceCounters", "rng", "stageTiming", "threadCpuNanoseconds",
  ].sort(), `${implementation} sample has unexpected fields`);
  const kernel = unsigned(sample.kernelNanoseconds,
    `${implementation} kernel time`, { positive: true });
  const threadCpu = unsigned(sample.threadCpuNanoseconds,
    `${implementation} thread CPU time`);
  const peakRss = unsigned(sample.peakRssKiB, `${implementation} peak RSS`, {
    positive: true,
  });
  const workCounters = counters(sample.counters, `${implementation} work counters`);
  const resources = counters(sample.resourceCounters,
    `${implementation} resource counters`);
  assert.notEqual(sample.output, null, `${implementation} output is missing`);
  assert.notEqual(sample.replay, null, `${implementation} replay is missing`);
  assert.notEqual(sample.rng, null, `${implementation} RNG state is missing`);
  const stageTiming = boundary === "prepared-kernel"
    ? validateStageTiming(sample.stageTiming, kernel)
    : sample.stageTiming === null ? null
      : validateStageTiming(sample.stageTiming, kernel);
  return {
    kernel, threadCpu, peakRss, workCounters, resources, stageTiming,
    outputDigest: canonicalDigest(sample.output),
    replayDigest: canonicalDigest(sample.replay),
    rngDigest: canonicalDigest(sample.rng),
    workDigest: canonicalDigest(workCounters),
  };
}

function validateAdapter(adapter, implementation) {
  assert(adapter && typeof adapter === "object" && !Array.isArray(adapter));
  assert.equal(adapter.implementation, implementation,
    `adapter identity must be ${implementation}`);
  assert.equal(typeof adapter.runFresh, "function",
    `${implementation} adapter requires runFresh()`);
  if (adapter.warmup !== undefined) assert.equal(typeof adapter.warmup, "function");
  return adapter;
}

function addCounterTotals(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = String(BigInt(target[key] || "0") + BigInt(value));
  }
}

function assertSameDigests(reference, sample, label) {
  for (const key of ["outputDigest", "replayDigest", "rngDigest", "workDigest"]) {
    if (reference[key] === null) reference[key] = sample[key];
    assert.equal(sample[key], reference[key], `${label} changed ${key}`);
  }
}

async function executeFreshBatch(adapter, {
  boundary,
  fieldId,
  repetitions,
  seed,
  tier,
}) {
  assert(Number.isSafeInteger(repetitions) && repetitions >= 1);
  const digests = {
    outputDigest: null, replayDigest: null, rngDigest: null, workDigest: null,
  };
  let kernel = 0n;
  let threadCpu = 0n;
  let peakRss = 0n;
  let perCallCounters = null;
  const resourceTotals = {};
  const stageTotals = Object.fromEntries(PREPARED_STAGE_NAMES.map(name => [name, 0n]));
  let stageInclusive = 0n;
  let stageUnattributed = 0n;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const raw = await adapter.runFresh({
      boundary, fieldId, repetition, seed, tier,
    });
    const sample = validateFreshSample(raw, {
      implementation: adapter.implementation, boundary,
    });
    assertSameDigests(digests, sample,
      `${adapter.implementation} fresh computation ${repetition}`);
    perCallCounters ??= sample.workCounters;
    assert.deepEqual(sample.workCounters, perCallCounters,
      `${adapter.implementation} source work changed across fresh computations`);
    kernel += sample.kernel;
    threadCpu += sample.threadCpu;
    if (sample.peakRss > peakRss) peakRss = sample.peakRss;
    addCounterTotals(resourceTotals, sample.resources);
    if (sample.stageTiming !== null) {
      stageInclusive += BigInt(sample.stageTiming.inclusiveNanoseconds);
      stageUnattributed += BigInt(sample.stageTiming.unattributedNanoseconds);
      for (const name of PREPARED_STAGE_NAMES)
        stageTotals[name] += BigInt(sample.stageTiming.leaves[name]);
    }
  }
  return {
    repetitions,
    wallNanoseconds: String(kernel),
    threadCpuNanoseconds: String(threadCpu),
    peakRssKiB: String(peakRss),
    ...digests,
    counters: perCallCounters,
    resourceCounters: resourceTotals,
    stageTiming: boundary === "prepared-kernel" ? {
      inclusiveNanoseconds: String(stageInclusive),
      leaves: Object.fromEntries(PREPARED_STAGE_NAMES.map(name =>
        [name, String(stageTotals[name])])),
      unattributedNanoseconds: String(stageUnattributed),
    } : null,
  };
}

async function calibrateAdapter(adapter, request, {
  minimumArmNanoseconds = ONE_SECOND_NS,
  maximumDoublings = 30,
} = {}) {
  assert(BigInt(minimumArmNanoseconds) >= ONE_SECOND_NS,
    "qualification calibration cannot target less than one second");
  assert(Number.isSafeInteger(maximumDoublings) && maximumDoublings >= 0);
  let repetitions = 1;
  for (let generation = 0; generation <= maximumDoublings; generation += 1) {
    const batch = await executeFreshBatch(adapter, { ...request, repetitions });
    if (BigInt(batch.wallNanoseconds) >= BigInt(minimumArmNanoseconds)) {
      return {
        excludedFromTiming: true,
        targetNanoseconds: String(minimumArmNanoseconds),
        doublingGeneration: generation,
        repetitions,
        observedNanoseconds: batch.wallNanoseconds,
      };
    }
    repetitions *= 2;
    assert(Number.isSafeInteger(repetitions), "calibration repetition count overflowed");
  }
  throw new Error(`${adapter.implementation} calibration did not reach one second`);
}

function scheduleForTier(tier) {
  return tier === "diagnostic"
    ? stageDiagnosticSchedule()
    : finalQualificationSchedule();
}

async function runAlternatingSuccessPath({
  adapters,
  boundary,
  fieldId,
  seed,
  tier,
  minimumArmNanoseconds = ONE_SECOND_NS,
}) {
  assert(typeof fieldId === "string" && fieldId.length > 0);
  assert.match(seed, /^(0|[1-9][0-9]*)$/);
  assert(["diagnostic", "flag-zero", "compact-flag-one"].includes(tier));
  assert(["relation-retry", "sparse-hnf-snf-transform", "unit-regulator",
    "honesty-generators-final", "prepared-kernel", "nfinit-context"].includes(boundary));
  const byImplementation = Object.fromEntries(IMPLEMENTATIONS.map(implementation => {
    const adapter = adapters[implementation];
    return [implementation, validateAdapter(adapter, implementation)];
  }));
  for (const implementation of IMPLEMENTATIONS) {
    if (byImplementation[implementation].warmup)
      await byImplementation[implementation].warmup({ boundary, fieldId, seed, tier });
  }
  const request = { boundary, fieldId, seed, tier };
  const calibration = {};
  for (const implementation of IMPLEMENTATIONS) {
    calibration[implementation] = await calibrateAdapter(
      byImplementation[implementation], request, { minimumArmNanoseconds });
  }
  const repetitionsByImplementation = Object.fromEntries(IMPLEMENTATIONS.map(name =>
    [name, calibration[name].repetitions]));
  const expected = {
    outputDigest: null, replayDigest: null, rngDigest: null, workDigest: null,
  };
  const blocks = [];
  const stageBlocks = [];
  for (const [blockIndex, order] of scheduleForTier(tier).entries()) {
    const startedAt = new Date().toISOString();
    const arms = [];
    const stageArms = [];
    for (const [position, label] of [...order].entries()) {
      const implementation = implementationForLabel(label);
      const batch = await executeFreshBatch(byImplementation[implementation], {
        ...request, repetitions: repetitionsByImplementation[implementation],
      });
      assert(BigInt(batch.wallNanoseconds) >= BigInt(minimumArmNanoseconds),
        `${implementation} retained arm did not exceed one second`);
      assertSameDigests(expected, batch,
        `block ${blockIndex} ${implementation} arm ${position}`);
      const { stageTiming, ...receiptArm } = batch;
      arms.push({ position, label, implementation, ...receiptArm,
        exitStatus: 0, timeout: false });
      stageArms.push({ position, label, implementation, stageTiming });
    }
    blocks.push({ blockIndex, order, startedAt,
      finishedAt: new Date().toISOString(), arms });
    stageBlocks.push({ blockIndex, order, arms: stageArms });
  }
  return {
    schema: "sagejs.pari-class-group/qualification-execution-core-v1",
    qualifiedTiming: false,
    fieldId,
    boundary,
    tier,
    seed,
    calibration,
    repetitionsByImplementation,
    commonDigests: expected,
    blocks,
    stageBlocks,
    note: "Success-path blocks only; host approval, lock ownership, provenance, failure journaling, and qualified promotion remain coordinator responsibilities.",
  };
}

module.exports = {
  PREPARED_STAGE_NAMES,
  calibrateAdapter,
  executeFreshBatch,
  runAlternatingSuccessPath,
  scheduleForTier,
  validateFreshSample,
  validateStageTiming,
};

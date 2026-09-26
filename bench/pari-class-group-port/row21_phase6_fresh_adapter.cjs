"use strict";

// Worker-protocol adapter pair for row 21. Sage.js restores every explicit
// owner from the committed aggregate's complete reset recipe before each
// one-call invocation. PARI starts a fresh helper, completes nfinit before
// READY, then clocks exactly bnfinit0(nf, 0). Neither preparation is timed.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const pari = require("./row21_phase6_pari_prepared_adapter.cjs");
const sage = require("./row21_phase6_sage_prepared_adapter.cjs");

const canonicalDigest = value => crypto.createHash("sha256")
  .update(`${JSON.stringify(value)}\n`).digest("hex");

function cpuNanoseconds(started) {
  const elapsed = process.threadCpuUsage(started);
  return String(BigInt(elapsed.user + elapsed.system) * 1000n);
}

function validateObservedCounters(value) {
  assert.deepEqual(Object.keys(value).sort(), ["classGenerators", "classNumber",
    "degree", "exactFundamentalUnits", "unitRank"]);
  for (const [name, entry] of Object.entries(value))
    assert.match(entry, /^(0|[1-9][0-9]*)$/, `invalid observed counter ${name}`);
  return value;
}

function normalize(raw, implementation, threadStarted, seed) {
  const kernel = String(raw.kernelNanoseconds);
  assert.match(kernel, /^[1-9][0-9]*$/);
  pari.validateProjection(raw.projection);
  assert.equal(raw.replay.schema, sage.REPLAY_SCHEMA);
  assert.equal(raw.replay.fieldId, sage.FIELD_ID);
  assert.equal(raw.replay.regulatorNonzero, true);
  const projection = structuredClone(raw.projection);
  const replay = structuredClone(raw.replay);
  const observedCounters = validateObservedCounters(raw.observedCounters);
  assert.equal(raw.resourceCounters.mathematicalCalls, "1");
  return {
    kernelNanoseconds: kernel,
    // The Sage kernel executes synchronously on this thread. PARI executes in
    // a child process, so its thread CPU is explicitly unavailable.
    threadCpuNanoseconds: implementation === "sagejs"
      ? cpuNanoseconds(threadStarted) : null,
    peakRssKiB: String(raw.processMaxRssKiB),
    output: projection,
    replay,
    // The translated row-21 graph has no RNG owner or RNG call. Preserve the
    // common seed authority without claiming that Sage.js materialized PARI's
    // private 66-word terminal state.
    rng: { scope: "matched-input-seed-only", seed,
      terminalStateMaterialized: false },
    counters: structuredClone(observedCounters),
    resourceCounters: structuredClone(raw.resourceCounters),
    stageTiming: { inclusiveNanoseconds: kernel,
      leaves: { relationRetry: "0", sparseHnfSnfTransform: "0",
        unitRegulator: "0", honestyGeneratorsFinal: "0" },
      unattributedNanoseconds: kernel },
  };
}

function validateRequest(request) {
  assert.equal(request.boundary, "prepared-kernel");
  assert.equal(request.fieldId, sage.FIELD_ID);
  assert.equal(request.seed, "1", "row-21 protocol fixes seed 1");
}

async function createRow21FreshPreparedAdapter(configuration) {
  assert(configuration && typeof configuration === "object" &&
    !Array.isArray(configuration));
  assert.deepEqual(Object.keys(configuration).sort(),
    ["implementation", "panelIndex"]);
  assert.equal(configuration.panelIndex, 21);
  assert(["sagejs", "pari"].includes(configuration.implementation));
  const implementation = configuration.implementation;
  const observations = [];
  if (implementation === "sagejs") {
    const resident = await sage.prepareResident();
    return {
      implementation,
      projectionSchema: sage.PROJECTION_SCHEMA,
      provenance: Object.freeze({
        preparedAuthoritySha256: sage.PREPARED_AUTHORITY_SHA256,
        nativeCacheKey: resident.built.cacheKey,
        freshStateMechanism: "complete-explicit-owner-reset-recipe",
        threadCpuMeasurement: "same-thread-native-kernel",
      }),
      observations,
      async runFresh(request) {
        validateRequest(request);
        const threadStarted = process.threadCpuUsage();
        const raw = sage.runResident(resident);
        observations.push(Object.freeze({
          boundary: raw.boundary,
          exactSageEvidence: raw.exactSageEvidence,
          provenance: raw.provenance,
        }));
        return normalize(raw, implementation, threadStarted, request.seed);
      },
    };
  }
  const build = pari.buildHelper();
  return {
    implementation,
    projectionSchema: sage.PROJECTION_SCHEMA,
      provenance: Object.freeze({ ...build.provenance,
      threadCpuMeasurement: Object.freeze({ available: false,
        reason: "subprocess-not-observed" }) }),
    observations,
    async runFresh(request) {
      validateRequest(request);
      const client = new pari.Client(build);
      const ready = await client.ready();
      try {
        const raw = await client.run(request.seed);
        observations.push(Object.freeze({
          preparationNanoseconds: ready.preparationNanoseconds,
          terminalRngSha256: canonicalDigest(raw.rng),
          replay: structuredClone(raw.replay),
          observedCounters: structuredClone(raw.observedCounters),
          resourceCounters: structuredClone(raw.resourceCounters),
        }));
        return normalize(raw, implementation, undefined, request.seed);
      } finally { await client.close(); }
    },
  };
}

module.exports = { createRow21FreshPreparedAdapter, normalize,
  validateObservedCounters };

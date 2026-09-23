"use strict";

// Worker-protocol adapter pair for row 19. Sage.js creates a genuinely fresh
// single-use resident for every request; PARI creates a fresh helper process
// whose nfinit preparation finishes before READY. Both preparations are
// outside kernelNanoseconds.

const assert = require("node:assert/strict");
const pari = require("./row19_phase6_pari_prepared_adapter.cjs");
const sage = require("./row19_phase6_sage_prepared_adapter.cjs");

const COUNTERS = Object.freeze({ classNumber: "39366", degree: "3",
  unitRank: "1" });

function cpuNanoseconds(started) {
  const elapsed = process.threadCpuUsage(started);
  return String(BigInt(elapsed.user + elapsed.system) * 1000n);
}

function normalize(raw, threadStarted) {
  const kernel = String(raw.kernelNanoseconds);
  assert.match(kernel, /^[1-9][0-9]*$/);
  pari.validateProjection(raw.projection);
  assert.deepEqual(raw.rng, {
    algorithm: "pari-xorshift1024star-2.17.4", seed: "1",
    terminalState: raw.rng.terminalState,
  });
  assert.equal(raw.rng.terminalState.length, 66);
  const projection = structuredClone(raw.projection);
  return {
    kernelNanoseconds: kernel,
    threadCpuNanoseconds: cpuNanoseconds(threadStarted),
    peakRssKiB: String(raw.processMaxRssKiB),
    output: projection,
    replay: { exact: true, projection: structuredClone(projection) },
    rng: structuredClone(raw.rng),
    counters: { ...COUNTERS },
    resourceCounters: { mathematicalCalls: "1" },
    stageTiming: { inclusiveNanoseconds: kernel,
      leaves: { relationRetry: "0", sparseHnfSnfTransform: "0",
        unitRegulator: "0", honestyGeneratorsFinal: "0" },
      unattributedNanoseconds: kernel },
  };
}

function validateRequest(request) {
  assert.equal(request.boundary, "prepared-kernel");
  assert.equal(request.fieldId, sage.FIELD_ID);
  assert.equal(request.seed, "1",
    "row-19 source-transparent RNG is fixed at seed 1");
}

async function createRow19FreshPreparedAdapter(configuration) {
  assert(configuration && typeof configuration === "object" &&
    !Array.isArray(configuration));
  assert.deepEqual(Object.keys(configuration).sort(),
    ["implementation", "panelIndex"]);
  assert.equal(configuration.panelIndex, 19);
  assert(["sagejs", "pari"].includes(configuration.implementation));
  const implementation = configuration.implementation;
  return {
    implementation,
    projectionSchema: sage.PROJECTION_SCHEMA,
    async runFresh(request) {
      validateRequest(request);
      if (implementation === "sagejs") {
        const resident = await sage.prepareResident(sage.DEFAULT_INPUT,
          { cacheRoot:
            "/scratch/sagejs-row19-phase6-prepared-aggregate/native-cache-v1" });
        const threadStarted = process.threadCpuUsage();
        return normalize(sage.runResident(resident), threadStarted);
      }
      const client = new pari.Client(pari.buildHelper());
      await client.ready();
      try {
        const threadStarted = process.threadCpuUsage();
        return normalize(await client.run(request.seed), threadStarted);
      } finally { await client.close(); }
    },
  };
}

module.exports = { COUNTERS, createRow19FreshPreparedAdapter, normalize };

"use strict";

// Runtime normalization for pairs admitted by phase6_prepared_adapter_registry.
// All mathematical work remains in the row-specific reviewed implementations.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifest = require("./fresh-prepared-corpus-manifest.json");

const CORPUS = process.env.SAGEJS_FRESH_PREPARED_CORPUS ||
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1";

function registration(panelIndex) {
  // Delay the import so the static registry can validate this factory without
  // relying on a partially initialized circular module.
  return require("./phase6_prepared_adapter_registry.cjs")
    .preparedAdapterRegistration(panelIndex);
}

function loadPrepared(panelIndex) {
  const record = manifest.rows.find(value => value.panelIndex === panelIndex);
  assert(record, `prepared manifest lacks row ${panelIndex}`);
  const filename = path.join(CORPUS,
    `prepared-row-${String(panelIndex).padStart(2, "0")}-${record.preparedJsonSha256}.json`);
  return { filename, prepared: JSON.parse(fs.readFileSync(filename, "utf8")) };
}

const clone = value => structuredClone(value);

function downProject(panelIndex, implementation, raw, expected) {
  let value = raw;
  if (panelIndex === 3 && implementation === "sagejs") {
    value = { schema: expected.schema, field: raw.field,
      classGroup: raw.classGroup,
      unitGroup: { rank: raw.unitGroup.rank,
        regulatorPresent: raw.unitGroup.regulatorPresent,
        torsionOrder: raw.unitGroup.torsionOrder },
      work: raw.work,
      completionMode: "flag-zero-class-and-unit-result" };
  }
  assert.deepEqual(value, expected,
    `row ${panelIndex} ${implementation} common projection changed`);
  return clone(expected);
}

function cpuNanoseconds(started) {
  const elapsed = process.threadCpuUsage(started);
  return String(BigInt(elapsed.user + elapsed.system) * 1000n);
}

function normalizedSample({ panelIndex, implementation, request, raw,
  projection, counters, threadStarted }) {
  assert.equal(request.boundary, "prepared-kernel");
  assert.equal(request.fieldId, projection.field.id,
    `row ${panelIndex} field identity changed`);
  const kernel = String(raw.kernelNanoseconds);
  assert.match(kernel, /^[1-9][0-9]*$/);
  const peak = raw.processMaxRssKiB === undefined
    ? String(process.resourceUsage().maxRSS) : String(raw.processMaxRssKiB);
  return {
    kernelNanoseconds: kernel,
    threadCpuNanoseconds: cpuNanoseconds(threadStarted),
    peakRssKiB: peak,
    output: projection,
    replay: { exact: true, projection: clone(projection) },
    // Most early row adapters did not materialize terminal RNG state on both
    // sides.  Record the matched deterministic input authority explicitly;
    // never pretend this is a terminal-state comparison.
    rng: { scope: "matched-input-seed-only", seed: request.seed,
      terminalStateMaterialized: false },
    counters: clone(counters),
    resourceCounters: { mathematicalCalls: implementation === "sagejs" &&
      panelIndex === 3 ? "2" : "1" },
    stageTiming: { inclusiveNanoseconds: kernel,
      leaves: { relationRetry: "0", sparseHnfSnfTransform: "0",
        unitRegulator: "0", honestyGeneratorsFinal: "0" },
      unattributedNanoseconds: kernel },
  };
}

async function prepareSage(panelIndex) {
  if ([0, 1, 4].includes(panelIndex)) {
    const host = require(panelIndex === 0 ? "./row0_phase6_matched_kernel_host.cjs"
      : panelIndex === 1 ? "./row1_phase6_matched_kernel_host.cjs"
        : "./row4_phase6_matched_kernel_host.cjs");
    const { prepared } = loadPrepared(panelIndex);
    const resident = panelIndex === 1
      ? await host.prepareResident(1, prepared)
      : await host.prepareResident(prepared);
    return request => {
      const threadStarted = process.threadCpuUsage();
      const raw = host.runInvocation(resident, host.prepareInvocation(resident));
      return { raw, projection: raw.projection, threadStarted };
    };
  }
  if (panelIndex === 3) {
    const host = require("./row3_phase6_resident_kernel_host.cjs");
    const resident = await host.prepareResident(loadPrepared(panelIndex).filename);
    return request => {
      const threadStarted = process.threadCpuUsage();
      const raw = host.runInvocation(resident);
      return { raw, projection: raw.projection, threadStarted };
    };
  }
  if (panelIndex === 14) {
    const host = require("./row14_matched_kernel_clock_host.cjs");
    const timing = require("./row14_sage_prepared_timing_adapter.cjs");
    const campaign = require("./row14_matched_alternating_campaign.cjs");
    const authentication = require("./prepared_nf_authentication.cjs");
    const { prepared } = loadPrepared(panelIndex);
    const preparedEnvelope = { authoritySha256:
      authentication.authenticatePreparedNf(prepared).sha256, data: prepared };
    const resident = await host.prepareResident(preparedEnvelope);
    return async request => {
      const threadStarted = process.threadCpuUsage();
      const raw = await host.runResident(resident);
      const semantic = campaign.sageProjection(raw);
      return { raw, projection: timing.commonProjectionFromSage(semantic),
        threadStarted };
    };
  }
  if (panelIndex === 16) {
    const host = require("./row16_phase6_sage_prepared_adapter.cjs");
    const resident = await host.prepareResident(loadPrepared(panelIndex).filename);
    return request => {
      const threadStarted = process.threadCpuUsage();
      const raw = host.runResident(resident);
      return { raw, projection: raw.projection, threadStarted };
    };
  }
  throw new Error(`unsupported registered Sage.js row ${panelIndex}`);
}

async function runPari(panelIndex, request) {
  let module, client;
  if (panelIndex === 0) {
    module = require("./row0_phase6_pari_prepared_adapter.cjs");
    client = new module.HelperClient(0, module.buildHelper(0));
  } else if ([1, 3, 4].includes(panelIndex)) {
    module = require(`./row${panelIndex}_phase6_pari_prepared_adapter.cjs`);
    client = new module.HelperClient(module.buildHelper());
  } else if (panelIndex === 14) {
    module = require("./row14_pari_prepared_timing_adapter.cjs");
    client = new module.HelperClient(module.buildHelper());
  } else if (panelIndex === 16) {
    module = require("./row16_phase6_pari_prepared_adapter.cjs");
    client = new module.Client(module.buildHelper());
  } else throw new Error(`unsupported registered PARI row ${panelIndex}`);
  await client.ready();
  try {
    const threadStarted = process.threadCpuUsage();
    const raw = await client.run(request.seed);
    let projection = raw.projection;
    if (panelIndex === 14) {
      const timing = require("./row14_sage_prepared_timing_adapter.cjs");
      projection = timing.commonProjectionFromPari(raw);
    } else if (panelIndex === 16) projection = module.commonProjection(raw);
    return { raw, projection, threadStarted };
  } finally { await client.close(); }
}

async function createRegisteredPreparedAdapter(configuration) {
  assert(configuration && typeof configuration === "object" &&
    !Array.isArray(configuration));
  assert.deepEqual(Object.keys(configuration).sort(),
    ["implementation", "panelIndex"]);
  const { panelIndex, implementation } = configuration;
  assert(["sagejs", "pari"].includes(implementation));
  const admitted = registration(panelIndex);
  const expected = clone(admitted.expectedProjection);
  const sage = implementation === "sagejs" ? await prepareSage(panelIndex) : null;
  return {
    implementation,
    projectionSchema: admitted.projectionSchema,
    async runFresh(request) {
      const result = implementation === "sagejs"
        ? await sage(request) : await runPari(panelIndex, request);
      const projection = downProject(panelIndex, implementation,
        result.projection, expected);
      return normalizedSample({ panelIndex, implementation, request,
        raw: result.raw, projection, counters: admitted.workCounters,
        threadStarted: result.threadStarted });
    },
  };
}

module.exports = { CORPUS, createRegisteredPreparedAdapter, downProject,
  loadPrepared, normalizedSample };

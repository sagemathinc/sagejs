"use strict";

// Runtime dispatch for pairs admitted by phase6_prepared_adapter_registry.
// The wrapper never constructs semantic output, replay, counters, or provenance:
// those must be returned by the admitted row-specific v2 sample verifier.

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

const admissionRegistry = () =>
  require("./phase6_prepared_adapter_registry.cjs");

function loadPrepared(panelIndex) {
  const record = manifest.rows.find(value => value.panelIndex === panelIndex);
  assert(record, `prepared manifest lacks row ${panelIndex}`);
  const filename = path.join(CORPUS,
    `prepared-row-${String(panelIndex).padStart(2, "0")}-${record.preparedJsonSha256}.json`);
  return { filename, prepared: JSON.parse(fs.readFileSync(filename, "utf8")) };
}

function explicitNativeCalls(raw) {
  const candidates = [raw.resourceCounters?.nativeCalls,
    raw.executionBoundary?.nativeCallsInsideClock,
    raw.boundary?.nativeCallsInsideClock]
    .filter(value => value !== undefined).map(String);
  assert(candidates.length > 0,
    "registered Sage.js sample lacks an explicit native-call count");
  for (const value of candidates) assert.match(value, /^[1-9][0-9]*$/);
  assert.equal(new Set(candidates).size, 1,
    "registered Sage.js native-call counts disagree");
  return candidates[0];
}

function downProject(panelIndex, implementation, raw, expected) {
  void raw; void expected;
  throw new Error(`row ${panelIndex} ${implementation} legacy metadata down-projection is disabled; a v2 row-specific verifier is required`);
}

function normalizedSample({ panelIndex, implementation, request, raw,
  projection, counters, threadStarted }) {
  void request; void raw; void projection; void counters; void threadStarted;
  throw new Error(`row ${panelIndex} ${implementation} legacy sample normalization is disabled; output, independent replay, and observed counters must come from a v2 row-specific verifier`);
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
      const raw = host.runInvocation(resident, host.prepareInvocation(resident));
      return { raw, diagnosticProjection: raw.projection };
    };
  }
  if (panelIndex === 3) {
    const host = require("./row3_phase6_resident_kernel_host.cjs");
    const resident = await host.prepareResident(loadPrepared(panelIndex).filename);
    return request => {
      const raw = host.runInvocation(resident);
      return { raw, diagnosticProjection: raw.projection };
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
    const nativeProvenance = require("./row14_live_native_provenance.cjs")
      .collectRow14LiveNativeProvenance(resident);
    return async request => {
      const cpuBefore = process.threadCpuUsage();
      const raw = await host.runResident(resident);
      const cpu = process.threadCpuUsage(cpuBefore);
      const semantic = campaign.sageProjection(raw);
      return { raw,
        wrapperObservation: { cpuNanoseconds:
          String((cpu.user + cpu.system) * 1000),
        authority: "process-thread-self", nativeProvenance },
        diagnosticProjection: timing.commonProjectionFromSage(semantic) };
    };
  }
  if (panelIndex === 16) {
    const host = require("./row16_phase6_sage_prepared_adapter.cjs");
    const resident = await host.prepareResident(loadPrepared(panelIndex).filename);
    return request => {
      const raw = host.runResident(resident);
      return { raw, diagnosticProjection: raw.projection };
    };
  }
  if ([8, 10, 11].includes(panelIndex)) {
    const module = require(panelIndex === 8
      ? "./row8_phase6_resident_prepared_adapter.cjs"
      : panelIndex === 10
        ? "./row10_phase6_resident_prepared_adapter.cjs"
        : "./row11_phase6_resident_prepared_adapter.cjs");
    const factory = module[panelIndex === 8
      ? "createRow8ResidentPreparedAdapter"
      : panelIndex === 10
        ? "createRow10ResidentPreparedAdapter"
        : "createRow11ResidentPreparedAdapter"];
    const adapter = await factory();
    return async request => {
      // The row-10 resident predates the corpus-wide generated field id and
      // retains PARI's polynomial label as its private assertion.  Both names
      // are frozen above; expose only the canonical corpus id at this boundary.
      const privateRequest = panelIndex === 10
        ? { ...request, fieldId: "pari-2.17.4:x^4-2000022*x-2000042" }
        : request;
      const raw = await adapter.runFresh(privateRequest);
      return { raw, diagnosticProjection: raw.output };
    };
  }
  if (panelIndex === 18) {
    const host = require("./row18_phase6_resident_host.cjs");
    const resident = await host.prepareResident(loadPrepared(panelIndex).prepared);
    return request => {
      const invocation = host.prepareInvocation(resident);
      const raw = host.runInvocation(resident, invocation);
      return { raw, diagnosticProjection: raw.projection };
    };
  }
  if (panelIndex === 20) {
    const host = require("./row20_phase6_resident_kernel.cjs");
    const resident = await host.prepareResident(loadPrepared(panelIndex).prepared);
    return request => {
      const raw = host.runResident(resident);
      return { raw, diagnosticProjection: raw };
    };
  }
  if (panelIndex === 23) {
    const host = require("./row23_phase6_sage_prepared_adapter.cjs");
    const resident = await host.prepareResident(loadPrepared(panelIndex).filename);
    return request => {
      const raw = host.runResident(resident);
      return { raw, diagnosticProjection: raw.projection };
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
  } else if (panelIndex === 23) {
    module = require("./row23_phase6_pari_prepared_adapter.cjs");
    client = new module.Client(module.buildHelper());
  } else if ([8, 10, 11, 18, 20].includes(panelIndex)) {
    module = require("./generic_phase6_pari_prepared_adapter.cjs");
    client = new module.HelperClient(
      module.frozenFieldSpecification(panelIndex), module.buildHelper());
  } else throw new Error(`unsupported registered PARI row ${panelIndex}`);
  await client.ready();
  try {
    const raw = await client.run(request.seed);
    let projection = raw.projection;
    if (panelIndex === 14) {
      const timing = require("./row14_sage_prepared_timing_adapter.cjs");
      projection = timing.commonProjectionFromPari(raw);
    } else if ([16, 23].includes(panelIndex)) {
      projection = module.commonProjection(raw);
    }
    return { raw, wrapperObservation: panelIndex === 14 ? {
      cpuNanoseconds: raw.cpuNanoseconds,
      authority: "pari-child-rusage",
      buildProvenance: client.build.provenance,
    } : undefined, diagnosticProjection: projection };
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
  const verifierAuthority = admitted.admissionCapability.matchedSample.verifier;
  const verifier = require(verifierAuthority.modulePath)
    [verifierAuthority.exportName];
  const sage = implementation === "sagejs" ? await prepareSage(panelIndex) : null;
  return {
    implementation,
    projectionSchema: admitted.matchedOutputSchema,
    async runFresh(request) {
      const result = implementation === "sagejs"
        ? await sage(request) : await runPari(panelIndex, request);
      const verified = await verifier({ implementation, request,
        raw: result.raw, diagnosticProjection: result.diagnosticProjection,
        wrapperObservation: result.wrapperObservation });
      return admissionRegistry().validateMatchedSampleV2({
        registration: admitted,
        capability: admitted.admissionCapability,
        implementation,
        verified,
      });
    },
    async runFreshVerified(request) {
      const result = implementation === "sagejs"
        ? await sage(request) : await runPari(panelIndex, request);
      const verified = await verifier({ implementation, request,
        raw: result.raw, diagnosticProjection: result.diagnosticProjection,
        wrapperObservation: result.wrapperObservation });
      admissionRegistry().validateMatchedSampleV2({ registration: admitted,
        capability: admitted.admissionCapability, implementation, verified });
      return verified;
    },
  };
}

module.exports = { CORPUS, createRegisteredPreparedAdapter, downProject,
  explicitNativeCalls, loadPrepared, normalizedSample };

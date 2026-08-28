"use strict";

const {
  attachIdentity,
  canonicalJson,
  contentIdentity,
  sha256,
} = require("../../../../tools/optimizer-development/common.cjs");
const {
  compilerIdentity,
  sourceBundleFromRecords,
  sourceUnitIdentity,
} = require("../../../../tools/optimizer-development/identity.cjs");
const { SCHEMAS } = require("../../../../tools/optimizer-development/schemas.cjs");

const ZERO = "0".repeat(64);
const ONE = "1".repeat(64);
const TWO = "2".repeat(64);

function distribution(samples = [100, 110, 120]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    unit: "microseconds",
    samples,
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted[sorted.length - 1],
  };
}

function counts(observations, quantity) {
  const result = { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 };
  for (const observation of observations) {
    result.total += observation[quantity];
    result[observation.mapping.status] += observation[quantity];
  }
  return result;
}

function candidate(loop, sourceUnitId = loop.sourceUnitId) {
  return {
    sourceUnitId,
    functionId: loop.functionId,
    regionId: loop.id,
    path: loop.source.path,
    range: {
      startLine: loop.source.line,
      startColumn: loop.source.column,
      endLine: loop.source.endLine,
      endColumn: loop.source.endColumn,
    },
    confidence: 1,
  };
}

function makeCompiler(dashboard, optionsDigest = TWO, overrides = {}) {
  return compilerIdentity({
    irSchema: dashboard.compilerIdentity.irSchema,
    compilerSourceBundleId: dashboard.compilerIdentity.compilerSourceBundleId,
    frontendDigest: dashboard.compilerIdentity.frontendDigest,
    catalogDigest: dashboard.compilerIdentity.catalogDigest,
    optionsDigest,
    ...overrides,
  });
}

function makeReceipt({
  dashboard,
  loop,
  ticks = 7,
  functionSamples = 50,
  mappingStatus = "attributed",
  routeOutcome = "guarded-fast",
  routeCount = 3,
  compiler = makeCompiler(dashboard),
  sourceDigest = null,
  oracleStatus = "pass",
  unmatchedTicks = 0,
  warmSealedProtocol = false,
} = {}) {
  const file = dashboard.files.find((item) => item.id === loop.sourceUnitId);
  const digest = sourceDigest || file.sourceDigest;
  const sourceUnit = sourceUnitIdentity({ path: file.path, digest, language: "python" });
  const sourceBundle = sourceBundleFromRecords([{ path: file.path, digest, bytes: file.bytes }]);
  const exactCandidate = candidate(loop, sourceUnit.id);
  const tickCandidates = mappingStatus === "attributed" ? [exactCandidate]
    : mappingStatus === "ambiguous" ? [
      exactCandidate,
      { ...exactCandidate,
        regionId: contentIdentity("sagejs.test-region/v1", { value: "other" }) },
    ] : [];
  const positionTicks = ticks === 0 ? [] : [{
    nodeId: 1,
    scriptId: "script-1",
    line: loop.source.line,
    ticks,
    mapping: { status: mappingStatus, candidates: tickCandidates },
  }];
  if (unmatchedTicks > 0) positionTicks.push({
    nodeId: 3,
    scriptId: "runtime-script",
    line: 1,
    ticks: unmatchedTicks,
    mapping: { status: "unmatched", candidates: [] },
  });
  const functionRows = functionSamples === 0 ? [] : [{
    nodeId: 2,
    samples: functionSamples,
    generated: {
      scriptId: "script-1",
      url: "file:///authenticated-evaluator.mjs",
      functionName: "compiled",
      line: 1,
      column: 0,
    },
    mapping: {
      status: "attributed",
      candidates: [{
        sourceUnitId: sourceUnit.id,
        functionId: loop.functionId,
        path: loop.source.path,
        range: exactCandidate.range,
        confidence: 1,
      }],
    },
  }];
  const routeEvents = routeCount === 0 ? [] : [{
    optimizerRegionId: `runtime-${loop.id}`,
    regionKind: "math.test-region",
    outcome: routeOutcome,
    count: routeCount,
    reason: ["guarded-fallback", "error"].includes(routeOutcome)
      ? { code: "telemetry.guard-failure", detail: { guard: "fixture-guard" } } : null,
    mapping: {
      status: mappingStatus,
      candidates: mappingStatus === "attributed" ? [{
        sourceUnitId: sourceUnit.id,
        functionId: loop.functionId,
        regionId: loop.id,
      }] : mappingStatus === "ambiguous" ? tickCandidates.map((item) => ({
        sourceUnitId: item.sourceUnitId,
        functionId: item.functionId,
        regionId: item.regionId,
      })) : [],
    },
  }];
  const workloadId = contentIdentity("sagejs.test-workload/v1", { path: loop.source.path });
  const artifact = attachIdentity("sagejs.optimizer-artifact/v1", {
    kind: "node-build",
    receiptDigest: ONE,
  });
  const samplingScripts = [{
    url: "file:///authenticated-evaluator.mjs",
    sha256: ONE,
    bytes: 100,
    authenticatedScriptIds: ["script-1"],
    rejectedSameUrlScriptIds: [],
  }];
  const samplingMapBindings = [{
    schema: "sagejs.optimizer-profile-map/v1",
    digest: TWO,
    sourceUnitId: sourceUnit.id,
    generatedSha256: ONE,
  }];
  const closureDigest = sha256(canonicalJson({
    scripts: samplingScripts,
    mapBindings: samplingMapBindings,
  }));
  const payload = {
    authority: "host-collector-with-private-evaluator-evidence",
    workload: { id: workloadId },
    sourceBundle,
    compiler,
    artifact,
    host: {
      platform: "linux",
      architecture: "x64",
      runtime: "node",
      runtimeVersion: "26.0.0",
      engine: "v8",
      engineVersion: "14.0",
    },
    capability: { runtime: "node", sourceSampling: "inspector-position-ticks" },
    configuration: {
      target: "v8",
      mode: "sage",
      capabilities: [],
      environmentDigest: ZERO,
    },
    outcome: { status: "success", error: null },
    output: {
      digest: ONE,
      oracleResults: [{ id: "exact-oracle", status: oracleStatus,
        digest: oracleStatus === "unavailable" ? null : ONE }],
    },
    compilation: distribution(),
    execution: { cold: distribution([200, 210, 220]), warm: distribution() },
    phases: [],
    sampling: {
      kind: "v8-cpu",
      intervalMicroseconds: 1000,
      rawProfileDigest: TWO,
      timeDeltaMicroseconds: 10000,
      scripts: samplingScripts,
      mapBindings: samplingMapBindings,
      functionSampleCounts: counts(functionRows, "samples"),
      functionSamples: functionRows,
      positionTickCounts: counts(positionTicks, "ticks"),
      positionTicks,
      protocol: {
        scope: warmSealedProtocol
          ? "warm-prepared-sealed-generated-javascript-execution"
          : "cold-generated-javascript-load-and-execution",
        preparationMicroseconds: warmSealedProtocol ? 100 : 0,
        warmupRuns: warmSealedProtocol ? 1 : 0,
        repetitions: warmSealedProtocol ? 3 : 1,
        declaredArtifactCount: 1,
        authenticatedArtifactCount: 1,
        lateArtifactCount: 0,
        closureDigest,
      },
    },
    optimizer: {
      reportDigest: ZERO,
      regions: loop.decisions.slice(0, 1).map((decision) => ({
        regionId: loop.id,
        decisionId: contentIdentity("sagejs.test-runtime-decision/v1", {
          regionId: loop.id,
          compilerId: compiler.id,
        }),
        legacyDecisionId: `runtime-${loop.id}`,
        passId: decision.passId,
        selected: decision.selected,
        reasons: decision.rejectionReasons.map((reason) => ({ code: reason, detail: {} })),
      })),
    },
    runtime: {
      authority: "private-evaluator-closure",
      routeEventCounts: counts(routeEvents, "count"),
      routeEvents,
    },
    counters: { boundaryCrossings: 1, copiedBytes: 2, materializations: 3, allocations: 4 },
    resources: { liveBefore: 0, liveAfter: 0, highWater: 1 },
    overhead: {
      method: "paired-alternating",
      samplingIntervalMicroseconds: 1000,
      baselineRunsMicroseconds: [10, 10, 10],
      instrumentedRunsMicroseconds: [10, 10, 10],
      medianRatio: 1,
      reviewedMaximumRatio: 1.1,
      status: "pass",
    },
  };
  return attachIdentity(SCHEMAS.profile, payload);
}

module.exports = { candidate, makeCompiler, makeReceipt };

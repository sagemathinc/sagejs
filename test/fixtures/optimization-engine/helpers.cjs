"use strict";

const { sha256 } = require("../../../tools/optimizer-development/common.cjs");
const contracts = require("../../../tools/optimization-engine/contracts.cjs");
const { evidenceIdsForDetails } = require("../../../tools/optimization-engine/category-contracts.cjs");

const id = (name) => `sha256:${sha256(name)}`;
const digest = (name) => sha256(name);
const one = (name) => [id(name)];

function authority(kind = "validated-input-set", inputs = []) {
  return { kind, producer: "test.optimization-engine", validatedInputIds: [...inputs].sort() };
}

function epoch() {
  return contracts.createDocument("epoch", {
    authority: authority("trusted-integration"),
    revision: {
      commit: "1".repeat(40), tree: "2".repeat(40), clean: true,
      repositorySourceClosureId: id("source-closure"),
    },
    build: {
      receiptPath: "dist/build-receipt.json",
      receiptDigest: digest("build-receipt"),
      outputManifestId: id("output-manifest"),
      outputDigest: digest("output-manifest"),
      sourceClosureId: id("source-closure"),
    },
    catalogId: id("catalog"),
    workloadIds: [id("workload")],
    runtime: {
      node: "v26.7.0", engine: "v8", operatingSystem: "linux", architecture: "x64",
      capabilities: ["flint"],
    },
    components: [],
    profiler: { protocolId: id("protocol"), calibrationId: id("calibration") },
    reasonRegistryId: id("reasons"),
    schemaRegistryId: id("schemas"),
    producer: { implementationId: id("producer"), argv: ["test"] },
  });
}

function workload() {
  return contracts.createDocument("workload", {
    authority: authority("reviewed-contract"),
    sourceClosureId: id("workload-source"),
    title: "Auditor fixture",
    owner: "optimization-engine",
    role: "representative",
    publicEntry: {
      path: "bench/auditor.py", name: "public.auditor", mode: "sage",
      outputBoundary: "complete public result",
    },
    runner: { path: "bench/auditor.cjs", argv: [], environment: [] },
    corpus: { id: "auditor", digest: digest("corpus"), provenance: "fixture" },
    oracles: [{ id: "exact", kind: "invariant", digest: digest("oracle"), provenance: "fixture" }],
    phases: [{
      id: "production", label: "production", parentId: null,
      timing: "inclusive", mayOverlap: false,
    }],
    protocol: {
      warmupRuns: 3, repetitions: 11, timeoutMilliseconds: 1000,
      reset: "process", preparation: "warm-prepared",
    },
    platforms: ["linux-x64"], browsers: [], instrumentation: ["inclusive-timer"],
    materiality: { minimumWorstPairFraction: 0.1, minimumPairs: 11 },
  });
}

function subject(currentEpoch, currentWorkload) {
  return contracts.createDocument("subject", {
    authority: authority("reviewed-contract", [currentEpoch.id, currentWorkload.id]),
    binding: { epochId: currentEpoch.id, state: "current", predecessorIds: [] },
    name: "Audited public call",
    scope: "public-call",
    locator: {
      workloadId: currentWorkload.id,
      entryPath: currentWorkload.publicEntry.path,
      publicName: currentWorkload.publicEntry.name,
      mode: currentWorkload.publicEntry.mode,
      outputBoundary: currentWorkload.publicEntry.outputBoundary,
    },
    relations: [],
  }, { workloads: [currentWorkload] });
}

function specific(category) {
  const table = {
    algorithm: {
      kind: "algorithm", specificationId: id("algorithm-spec"),
      domainProofEvidenceIds: one("algorithm-domain"), oracleEvidenceIds: one("algorithm-oracle"),
      adversarialCorpusIds: one("algorithm-adversarial"),
      complexityEvidenceIds: one("algorithm-complexity"),
      crossoverObservationIds: one("algorithm-crossover"),
      failureModeEvidenceIds: one("algorithm-failure"),
      generalityWorkloadIds: one("algorithm-generality"),
    },
    "library-route": {
      kind: "library-route", capabilityId: id("library-capability"),
      libraryArtifactId: id("library-artifact"), declarationId: id("library-declaration"),
      semanticMappingEvidenceIds: one("library-mapping"),
      conversionObservationIds: one("library-conversion"),
      boundaryObservationIds: one("library-boundary"), resourceEvidenceIds: one("library-resource"),
      interruptionEvidenceIds: one("library-interruption"),
      batchingObservationIds: one("library-batching"),
      residencyObservationIds: one("library-residency"),
    },
    representation: {
      kind: "representation", ownershipGraphId: id("representation-owner"),
      lifetimeGraphId: id("representation-life"),
      aliasMutationEscapeEvidenceIds: one("representation-alias"),
      observabilityEvidenceIds: one("representation-observe"),
      scopeEvidenceIds: one("representation-scope"),
      transactionEvidenceIds: one("representation-transaction"),
      memoryObservationIds: one("representation-memory"),
      duplicateRepresentationEvidenceIds: one("representation-duplicate"),
      heldOutConsumerIds: one("representation-heldout"),
    },
    runtime: {
      kind: "runtime", componentId: "runtime.dispatch",
      semanticReachEvidenceIds: one("runtime-reach"),
      compatibilityEvidenceIds: one("runtime-compatibility"),
      adversarialEvidenceIds: one("runtime-adversarial"),
      distributionObservationIds: one("runtime-distribution"),
      budgetEvidenceIds: one("runtime-budget"), independentWorkloadIds: one("runtime-workload"),
    },
    boundary: {
      kind: "boundary", boundaryId: "ffi.operation",
      crossingObservationIds: one("boundary-crossings"), payloadObservationIds: one("boundary-payload"),
      ownershipEvidenceIds: one("boundary-owner"), lifetimeEvidenceIds: one("boundary-life"),
      residencyEvidenceIds: one("boundary-resident"), cleanupEvidenceIds: one("boundary-cleanup"),
      interruptionEvidenceIds: one("boundary-interrupt"),
      crossoverObservationIds: one("boundary-crossover"),
      rematerializationObservationIds: one("boundary-result"),
    },
    cache: {
      kind: "cache", cacheId: "runtime.cache", keySchemaId: id("cache-key"),
      sourceClosureId: id("cache-source"), stateGraphId: id("cache-state"),
      publicationEvidenceIds: one("cache-publication"),
      corruptionRecoveryEvidenceIds: one("cache-corruption"),
      invalidationDimensions: ["abi", "compiler", "engine", "options", "platform", "source"],
      invalidationEvidenceIds: one("cache-invalidation"), poisoningEvidenceIds: one("cache-poison"),
      isolationEvidenceIds: one("cache-isolation"), lifecycleObservationIds: one("cache-lifecycle"),
      disabledFallbackEvidenceIds: one("cache-disabled"),
    },
    source: {
      kind: "source", priorSourceUnitId: id("source-prior"),
      replacementSourceUnitId: id("source-next"), parseEvidenceIds: one("source-parse"),
      differentialEvidenceIds: one("source-differential"),
      effectPreservationEvidenceIds: one("source-effects"),
      maintenanceReviewEvidenceIds: one("source-review"),
      publicPerformanceObservationIds: one("source-public"),
      heldOutPerformanceObservationIds: one("source-heldout"),
      strictModuleEvidenceIds: one("source-strict"),
    },
    compiler: {
      kind: "compiler", compilerId: id("compiler-id"), optimizerProgramId: id("compiler-program"),
      decisionId: id("compiler-decision"), passId: "math.fixture.v1",
      recognitionEvidenceIds: one("compiler-recognition"), factEvidenceIds: one("compiler-facts"),
      invalidationEvidenceIds: one("compiler-invalidation"), loweringIds: ["v8.fixture.v1"],
      runtimeIntrinsicEvidenceIds: one("compiler-intrinsic"),
      preflightEvidenceIds: one("compiler-preflight"), routeEvidenceIds: one("compiler-route"),
      compileCostObservationIds: one("compiler-cost"),
      emittedSizeObservationIds: one("compiler-size"),
      independentConsumerIds: one("compiler-consumer"),
    },
  };
  return structuredClone(table[category]);
}

function proposal(category) {
  return {
    category,
    owner: "optimization-engine",
    mechanism: `${category} fixture`,
    changedComponents: ["reviewed component"],
    sourceRelationship: category === "compiler"
      ? "source-transparent" : category === "source" ? "source-changing" : "not-applicable",
    evidenceBoundary: "complete-public-call",
    fallback: {
      kind: category === "compiler" ? "same-source" : "guarded-source",
      entry: "guard before candidate effects",
      rollback: "untouched fallback",
    },
    costTransfer: { removes: ["baseline work"], adds: ["preflight"] },
    matureCapability: {
      status: category === "library-route" ? "available" : "not-duplicate",
      capabilityIds: category === "library-route" ? [id("mature-capability")] : [],
      auditEvidenceIds: [id(`mature-${category}`)],
    },
    semanticObligations: ["exact semantics"],
    architectureObligations: ["reviewed architecture"],
    platformObligations: ["correct capability fallback"],
    rejectionConditions: ["public threshold failure"],
    alternativeDispositions: contracts.INTERVENTION_CATEGORIES
      .filter((item) => item !== category)
      .map((item) => ({
        category: item, disposition: "inferior", reason: `${item} is not the reviewed mechanism`,
      }))
      .sort((left, right) => left.category.localeCompare(right.category)),
    specific: specific(category),
  };
}

function evidence(currentEpoch, currentProposal) {
  const ids = [
    ...evidenceIdsForDetails(currentProposal.category, currentProposal.specific),
    ...currentProposal.matureCapability.capabilityIds,
    ...currentProposal.matureCapability.auditEvidenceIds,
  ];
  return [...new Set(ids)].map((evidenceId) => ({ id: evidenceId, epochId: currentEpoch.id }));
}

function pairs(baseline = 1000, candidate = 700) {
  return Array.from({ length: 11 }, (_, index) => ({
    order: index % 2 ? "BAAB" : "ABBA",
    baselineMicroseconds: baseline + index,
    candidateMicroseconds: candidate + index,
    baselineOutputDigest: digest("same-output"),
    candidateOutputDigest: digest("same-output"),
  }));
}

function dimensions(overrides = {}) {
  return {
    semanticConfidence: "high",
    removableWallLowerMicroseconds: 300,
    independentWorkloads: 2,
    matureComponents: 1,
    portabilityCoverage: 4,
    rollbackSimplicity: "simple",
    resourceReduction: 10,
    maintenanceSurface: 2,
    overhead: 1,
    ...overrides,
  };
}

module.exports = {
  authority,
  dimensions,
  digest,
  evidence,
  epoch,
  id,
  pairs,
  proposal,
  specific,
  subject,
  workload,
};

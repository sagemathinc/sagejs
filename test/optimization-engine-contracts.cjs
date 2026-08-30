// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { attachIdentity, sha256 } = require("../tools/optimizer-development/common.cjs");
const engine = require("../tools/optimization-engine/contracts.cjs");

const id = (name) => `sha256:${sha256(name)}`;
const digest = (name) => sha256(name);
const authority = (kind = "validated-input-set", inputs = []) => ({
  kind,
  producer: "test.optimization-engine",
  validatedInputIds: [...inputs].sort(),
});

test("the live v2 registry has exactly ten matching wire schemas", () => {
  const directory = path.resolve(__dirname, "../architecture/optimization-engine");
  const expected = Object.entries(engine.SCHEMAS)
    .map(([kind, schema]) => ({ kind, schema }))
    .sort((left, right) => left.kind.localeCompare(right.kind));
  assert.equal(expected.length, 10);
  for (const { kind, schema } of expected) {
    const wire = JSON.parse(fs.readFileSync(
      path.join(directory, `${kind}-v2.schema.json`),
      "utf8",
    ));
    assert.equal(wire.properties.schema.const, schema);
    assert.equal(wire.additionalProperties, false);
    assert.deepEqual(wire.required.slice(0, 2), ["schema", "id"]);
  }
});

function epoch() {
  return engine.createDocument("epoch", {
    authority: authority("trusted-integration"),
    revision: {
      commit: "1".repeat(40),
      tree: "2".repeat(40),
      clean: true,
      repositorySourceClosureId: id("source-closure"),
    },
    build: {
      receiptPath: "dist/build-receipt.json",
      receiptDigest: digest("build-receipt"),
      outputManifestId: id("build-artifacts"),
      outputDigest: digest("build-output"),
      sourceClosureId: id("source-closure"),
    },
    catalogId: id("catalog"),
    workloadIds: [id("epoch-workload")],
    runtime: {
      node: "v26.7.0",
      engine: "v8-14",
      operatingSystem: "linux",
      architecture: "x64",
      capabilities: ["flint", "wasm"],
    },
    components: [
      {
        kind: "compiler-implementation",
        id: id("compiler-implementation"),
        digest: digest("compiler-implementation"),
      },
      {
        kind: "dashboard",
        id: id("dashboard"),
        digest: digest("dashboard"),
      },
    ],
    profiler: {
      protocolId: id("profile-protocol"),
      calibrationId: id("profile-calibration"),
    },
    reasonRegistryId: id("reason-registry"),
    schemaRegistryId: id("schema-registry"),
    producer: {
      implementationId: id("epoch-producer"),
      argv: ["node", "scripts/optimization-epoch.cjs", "create"],
    },
  });
}

function binding(epochId, state = "current") {
  return { epochId, state, predecessorIds: [] };
}

function publicSubject(currentEpoch, currentWorkload) {
  return engine.createDocument("subject", {
    authority: authority("reviewed-contract", [currentEpoch.id]),
    binding: binding(currentEpoch.id),
    name: "Dense polynomial integration",
    scope: "public-call",
    locator: {
      workloadId: currentWorkload.id,
      entryPath: "src/lib/sagejs/polynomial_algorithms/public_structural.py",
      publicName: "Polynomial.integral",
      mode: "sage",
      outputBoundary: "published polynomial with derivative replay",
    },
    relations: [],
  }, { workloads: [currentWorkload] });
}

function workloadDefinition() {
  return engine.createDocument("workload", {
    authority: authority("reviewed-contract"),
    sourceClosureId: id("workload-source-closure"),
    title: "Dense prime-field polynomial integral",
    owner: "optimization-engine",
    role: "representative",
    publicEntry: {
      path: "src/lib/sagejs/polynomial_algorithms/public_structural.py",
      name: "Polynomial.integral",
      mode: "sage",
      outputBoundary: "published polynomial with derivative replay",
    },
    runner: {
      path: "bench/optimizer-workloads/production-modular-candidates.cjs",
      argv: ["public-prime-polynomial-integral"],
      environment: ["SAGEJS_OPT_LEVEL"],
    },
    corpus: {
      id: "dense-integral",
      digest: digest("dense-integral-corpus"),
      provenance: "deterministic GF(65537) degree-69999 generator",
    },
    oracles: [{
      id: "derivative-replay",
      kind: "invariant",
      digest: digest("derivative-replay"),
      provenance: "differentiate the complete public result",
    }],
    phases: [{
      id: "production",
      label: "complete public call",
      parentId: null,
      timing: "inclusive",
      mayOverlap: false,
    }],
    protocol: {
      warmupRuns: 3,
      repetitions: 11,
      timeoutMilliseconds: 600000,
      reset: "process",
      preparation: "warm-prepared-sealed",
    },
    platforms: ["linux-x64", "windows-x64"],
    browsers: ["chromium"],
    instrumentation: ["inclusive-timer"],
    materiality: { minimumWorstPairFraction: 0.1, minimumPairs: 11 },
  });
}

function phaseSubject(currentEpoch, publicCall, currentWorkload) {
  return engine.createDocument("subject", {
    authority: authority("reviewed-contract", [publicCall.id, currentWorkload.id]),
    binding: binding(currentEpoch.id),
    name: "Dense integral phase",
    scope: "reviewed-phase",
    locator: { workloadId: currentWorkload.id, phaseId: "production" },
    relations: [{ kind: "contained-by", subjectId: publicCall.id }],
  }, { subjects: [publicCall], workloads: [currentWorkload] });
}

function observation(currentEpoch, subject, currentWorkload, channel = "wall-time") {
  const conserved = channel === "source-position-ticks";
  return engine.createDocument("observation", {
    authority: authority("observation-only", [subject.id, currentWorkload.id]),
    binding: binding(currentEpoch.id),
    subjectId: subject.id,
    workloadId: currentWorkload.id,
    channel,
    scope: {
      kind: "complete-public",
      subjectId: subject.id,
      phaseId: null,
      parentObservationId: null,
      mutuallyExclusiveGroup: null,
    },
    measurement: conserved
      ? {
          unit: "ticks", samples: [100], total: 100,
          attributed: 70, ambiguous: 5, unmatched: 20, stale: 5,
        }
      : {
          unit: "microseconds", samples: [2000000, 2100000], total: 4100000,
          attributed: 0, ambiguous: 0, unmatched: 0, stale: 0,
        },
    costBoundary: {
      included: ["allocation", "complete public result", "conversion"],
      excluded: [],
    },
    oracle: {
      status: "pass",
      outputDigest: digest("public-output"),
      exceptionDigest: null,
    },
    provenance: {
      producerCommand: "node bench/optimizer-workloads/production-modular-candidates.cjs",
      artifactDigest: digest(`observation-${channel}`),
      recordedAt: "2026-08-29T01:00:00.000Z",
    },
    details: { note: "independent observation channel" },
  }, { subjects: [subject], workloads: [currentWorkload] });
}

function specific(category) {
  const one = (name) => [id(name)];
  const contracts = {
    algorithm: {
      kind: "algorithm",
      specificationId: id("algorithm-spec"),
      domainProofEvidenceIds: one("algorithm-domain-proof"),
      oracleEvidenceIds: one("algorithm-oracle"),
      adversarialCorpusIds: one("algorithm-adversarial"),
      complexityEvidenceIds: one("algorithm-complexity"),
      crossoverObservationIds: one("algorithm-crossover"),
      failureModeEvidenceIds: one("algorithm-failure"),
      generalityWorkloadIds: one("algorithm-generality"),
    },
    "library-route": {
      kind: "library-route",
      capabilityId: id("flint-capability"),
      libraryArtifactId: id("flint-artifact"),
      declarationId: id("flint-declaration"),
      semanticMappingEvidenceIds: one("library-mapping"),
      conversionObservationIds: one("library-conversion"),
      boundaryObservationIds: one("library-boundary"),
      resourceEvidenceIds: one("library-resource"),
      interruptionEvidenceIds: one("library-interruption"),
      batchingObservationIds: one("library-batching"),
      residencyObservationIds: one("library-residency"),
    },
    representation: {
      kind: "representation",
      ownershipGraphId: id("representation-owner"),
      lifetimeGraphId: id("representation-lifetime"),
      aliasMutationEscapeEvidenceIds: one("representation-alias"),
      observabilityEvidenceIds: one("representation-observability"),
      scopeEvidenceIds: one("representation-scope"),
      transactionEvidenceIds: one("representation-transaction"),
      memoryObservationIds: one("representation-memory"),
      duplicateRepresentationEvidenceIds: one("representation-duplicate"),
      heldOutConsumerIds: one("representation-heldout"),
    },
    runtime: {
      kind: "runtime",
      componentId: "runtime.call-dispatch",
      semanticReachEvidenceIds: one("runtime-reach"),
      compatibilityEvidenceIds: one("runtime-compatibility"),
      adversarialEvidenceIds: one("runtime-adversarial"),
      distributionObservationIds: one("runtime-distribution"),
      budgetEvidenceIds: one("runtime-budget"),
      independentWorkloadIds: one("runtime-workload"),
    },
    boundary: {
      kind: "boundary",
      boundaryId: "flint.integral",
      crossingObservationIds: one("boundary-crossings"),
      payloadObservationIds: one("boundary-payload"),
      ownershipEvidenceIds: one("boundary-ownership"),
      lifetimeEvidenceIds: one("boundary-lifetime"),
      residencyEvidenceIds: one("boundary-residency"),
      cleanupEvidenceIds: one("boundary-cleanup"),
      interruptionEvidenceIds: one("boundary-interruption"),
      crossoverObservationIds: one("boundary-crossover"),
      rematerializationObservationIds: one("boundary-rematerialization"),
    },
    cache: {
      kind: "cache",
      cacheId: "runtime.module-cache",
      keySchemaId: id("cache-key"),
      sourceClosureId: id("cache-source"),
      stateGraphId: id("cache-state"),
      publicationEvidenceIds: one("cache-publication"),
      corruptionRecoveryEvidenceIds: one("cache-corruption"),
      invalidationDimensions: ["abi", "compiler", "engine", "options", "platform", "source"],
      invalidationEvidenceIds: one("cache-invalidation"),
      poisoningEvidenceIds: one("cache-poisoning"),
      isolationEvidenceIds: one("cache-isolation"),
      lifecycleObservationIds: one("cache-lifecycle"),
      disabledFallbackEvidenceIds: one("cache-disabled"),
    },
    source: {
      kind: "source",
      priorSourceUnitId: id("source-prior"),
      replacementSourceUnitId: id("source-replacement"),
      parseEvidenceIds: one("source-parse"),
      differentialEvidenceIds: one("source-differential"),
      effectPreservationEvidenceIds: one("source-effects"),
      maintenanceReviewEvidenceIds: one("source-review"),
      publicPerformanceObservationIds: one("source-public"),
      heldOutPerformanceObservationIds: one("source-heldout"),
      strictModuleEvidenceIds: one("source-strict"),
    },
    compiler: {
      kind: "compiler",
      compilerId: id("compiler"),
      optimizerProgramId: id("compiler-program"),
      decisionId: id("compiler-decision"),
      passId: "math.example-region.v1",
      recognitionEvidenceIds: one("compiler-recognition"),
      factEvidenceIds: one("compiler-facts"),
      invalidationEvidenceIds: one("compiler-invalidation"),
      loweringIds: ["v8.example-region.v1"],
      runtimeIntrinsicEvidenceIds: one("compiler-intrinsics"),
      preflightEvidenceIds: one("compiler-preflight"),
      routeEvidenceIds: one("compiler-routes"),
      compileCostObservationIds: one("compiler-cost"),
      emittedSizeObservationIds: one("compiler-size"),
      independentConsumerIds: one("compiler-consumer"),
    },
  };
  return contracts[category];
}

function intervention(currentEpoch, subject, category) {
  const alternatives = engine.INTERVENTION_CATEGORIES
    .filter((item) => item !== category)
    .map((item) => ({
      category: item,
      disposition: item === "compiler" ? "duplicate" : "inferior",
      reason: `${item} does not dominate the reviewed mechanism`,
    }))
    .sort((left, right) => left.category.localeCompare(right.category));
  return engine.createDocument("intervention", {
    authority: authority("validated-input-set", [subject.id]),
    binding: binding(currentEpoch.id),
    subjectId: subject.id,
    category,
    owner: "optimization-engine",
    mechanism: `${category} candidate mechanism`,
    changedComponents: ["reviewed production component"],
    sourceRelationship: category === "compiler"
      ? "source-transparent"
      : category === "source" ? "source-changing" : "not-applicable",
    evidenceBoundary: "complete-public-call",
    fallback: {
      kind: category === "compiler" ? "same-source" : "guarded-source",
      entry: "preflight before candidate effects",
      rollback: "publish only after complete success",
    },
    costTransfer: { removes: ["dynamic dispatch"], adds: ["one preflight"] },
    matureCapability: {
      status: category === "library-route" ? "available" : "not-duplicate",
      capabilityIds: category === "library-route" ? [id("flint-capability")] : [],
      auditEvidenceIds: [id(`mature-audit-${category}`)],
    },
    semanticObligations: ["exact output and exception equivalence"],
    architectureObligations: ["ordinary CPython-parseable source fallback"],
    platformObligations: ["Windows and browser capability fallback"],
    rejectionConditions: ["worst paired public saving below ten percent"],
    alternativeDispositions: alternatives,
    specific: specific(category),
  }, { subjects: [subject] });
}

test("v2 scopes validate public and phase subjects without compiler identity", () => {
  const currentEpoch = epoch();
  const currentWorkload = workloadDefinition();
  const publicCall = publicSubject(currentEpoch, currentWorkload);
  const phase = phaseSubject(currentEpoch, publicCall, currentWorkload);
  assert.equal(phase.scope, "reviewed-phase");
  assert.equal(publicCall.locator.workloadId, currentWorkload.id);

  const counterfeit = structuredClone(phase);
  counterfeit.relations[0].subjectId = id("counterfeit-parent");
  const stale = attachIdentity(counterfeit.schema, (({ schema: _s, id: _i, ...rest }) => rest)(counterfeit));
  assert.throws(
    () => engine.validateSubject(stale, { subjects: [publicCall] }),
    /unknown related subject/,
  );
});

test("observations conserve independent channels and keep classification non-authoritative", () => {
  const currentEpoch = epoch();
  const currentWorkload = workloadDefinition();
  const subject = publicSubject(currentEpoch, currentWorkload);
  const ticks = observation(currentEpoch, subject, currentWorkload, "source-position-ticks");
  assert.equal(ticks.measurement.total, 100);

  const counterfeit = structuredClone(ticks);
  counterfeit.measurement.unmatched = 21;
  const stale = attachIdentity(counterfeit.schema, (({ schema: _s, id: _i, ...rest }) => rest)(counterfeit));
  assert.throws(() => engine.validateObservation(stale), /do not conserve/);
});

test("all eight category contracts validate without laundering compiler evidence", () => {
  const currentEpoch = epoch();
  const currentWorkload = workloadDefinition();
  const subject = publicSubject(currentEpoch, currentWorkload);
  for (const category of engine.INTERVENTION_CATEGORIES) {
    const document = intervention(currentEpoch, subject, category);
    assert.equal(document.category, category);
  }

  const cache = structuredClone(intervention(currentEpoch, subject, "cache"));
  cache.specific.decisionId = id("fake-compiler-decision");
  const counterfeit = attachIdentity(cache.schema, (({ schema: _s, id: _i, ...rest }) => rest)(cache));
  assert.throws(() => engine.validateIntervention(counterfeit), /fields must be exactly/);

  const compiler = structuredClone(intervention(currentEpoch, subject, "compiler"));
  compiler.fallback.kind = "guarded-source";
  const badFallback = attachIdentity(
    compiler.schema,
    (({ schema: _s, id: _i, ...rest }) => rest)(compiler),
  );
  assert.throws(() => engine.validateIntervention(badFallback), /same-source fallback/);
});

test("opportunity, dossier, campaign, promotion, and outcome form one exact chain", () => {
  const currentEpoch = epoch();
  const currentWorkload = workloadDefinition();
  const subject = publicSubject(currentEpoch, currentWorkload);
  const observed = observation(currentEpoch, subject, currentWorkload);
  const selected = intervention(currentEpoch, subject, "library-route");
  const opportunity = engine.createDocument("opportunity", {
    authority: authority("validated-input-set", [observed.id, selected.id]),
    binding: binding(currentEpoch.id),
    subjectId: subject.id,
    observationIds: [observed.id],
    classifications: [{
      kind: "library-capability",
      observationIds: [observed.id],
      explanation: "existing FLINT capability covers the complete operation",
    }],
    interventionIds: [selected.id],
    losingEvidenceIds: [id("losing-compiler-target")],
    unresolvedObligations: [],
    decision: {
      status: "select",
      selectedInterventionId: selected.id,
      reasons: ["complete public materiality and mature capability"],
    },
  }, { observations: [observed], interventions: [selected] });
  const dossier = engine.createDocument("dossier", {
    authority: authority("validated-input-set", [opportunity.id, selected.id]),
    binding: binding(currentEpoch.id),
    opportunityId: opportunity.id,
    subjectId: subject.id,
    interventionId: selected.id,
    category: "library-route",
    observationIds: [observed.id],
    evidence: {
      capabilityEvidenceIds: [id("capability-evidence")],
      conversionPlanId: id("conversion-plan"),
      resourceEvidenceIds: [id("resource-evidence")],
    },
    measurementBoundary: ["complete public call including conversion and publication"],
    fallbackPlan: {
      entry: "preflight capability and domain",
      rollback: "untouched generic source",
      tests: ["singular denominator and missing-library fallback"],
    },
    promotionRequirements: ["11 pairs on representative and held-out workloads"],
  }, { interventions: [selected] });
  const campaign = engine.createDocument("campaign", {
    authority: authority("validated-input-set", [dossier.id]),
    binding: binding(currentEpoch.id),
    dossierId: dossier.id,
    interventionId: selected.id,
    category: "library-route",
    state: "review",
    lanes: [{
      id: "integration",
      role: "integration",
      claims: ["src/lib/sagejs/polynomial_algorithms/public_structural.py"],
    }],
    requiredEvidenceIds: [id("required-evidence")],
    representativeWorkloadIds: [currentWorkload.id],
    heldOutWorkloadIds: [id("heldout-workload")],
  }, { interventions: [selected] });
  const pairs = Array.from({ length: 11 }, (_, index) => ({
    order: index % 2 ? "BAAB" : "ABBA",
    baselineMicroseconds: 1000 + index,
    candidateMicroseconds: 500 + index,
    baselineOutputDigest: digest("same-output"),
    candidateOutputDigest: digest("same-output"),
  }));
  const comparison = (role, workloadId) => {
    const fractions = pairs.map((pair) =>
      (pair.baselineMicroseconds - pair.candidateMicroseconds) / pair.baselineMicroseconds);
    return {
      role,
      workloadId,
      pairs,
      baselineMedian: 1005,
      candidateMedian: 505,
      worstPairFraction: Math.min(...fractions),
      allPositive: true,
    };
  };
  const promotion = engine.createDocument("promotion", {
    authority: authority("trusted-integration", [campaign.id]),
    binding: binding(currentEpoch.id),
    campaignId: campaign.id,
    interventionId: selected.id,
    category: "library-route",
    decision: "accepted",
    comparisons: [
      comparison("held-out", id("heldout-workload")),
      comparison("representative", currentWorkload.id),
    ],
    equivalence: {
      outputs: true,
      exceptions: true,
      interruptions: true,
      mutation: true,
      publication: true,
    },
    fallbackEvidenceIds: [id("fallback-evidence")],
    resourceEvidenceIds: [id("resource-evidence")],
    negativeEvidenceIds: [id("negative-evidence")],
    platforms: ["linux-x64", "windows-x64"],
    browsers: ["chromium"],
    candidateRevision: {
      commit: "3".repeat(40),
      tree: "4".repeat(40),
      clean: true,
      buildArtifactId: id("candidate-build"),
    },
  });
  const outcome = engine.createDocument("outcome", {
    authority: authority("trusted-integration", [promotion.id]),
    binding: binding(currentEpoch.id),
    subjectId: subject.id,
    opportunityId: opportunity.id,
    interventionId: selected.id,
    campaignId: campaign.id,
    promotionId: promotion.id,
    disposition: "accepted",
    evidenceIds: [promotion.id],
    reasons: ["all public promotion gates passed"],
    supersedesIds: [],
    regressionState: "passing",
  });
  assert.equal(outcome.disposition, "accepted");
});

test("accepted promotion recomputes the conservative public threshold", () => {
  const pair = {
    order: "ABBA",
    baselineMicroseconds: 1000,
    candidateMicroseconds: 950,
    baselineOutputDigest: digest("same"),
    candidateOutputDigest: digest("same"),
  };
  const payload = {
    authority: authority("trusted-integration"),
    binding: binding(id("epoch")),
    campaignId: id("campaign"),
    interventionId: id("intervention"),
    category: "source",
    decision: "accepted",
    comparisons: ["held-out", "representative"].map((role) => ({
      role,
      workloadId: id(role),
      pairs: Array.from({ length: 11 }, () => pair),
      baselineMedian: 1000,
      candidateMedian: 950,
      worstPairFraction: 0.05,
      allPositive: true,
    })),
    equivalence: {
      outputs: true, exceptions: true, interruptions: true, mutation: true, publication: true,
    },
    fallbackEvidenceIds: [id("fallback")],
    resourceEvidenceIds: [id("resource")],
    negativeEvidenceIds: [id("negative")],
    platforms: ["linux-x64"],
    browsers: [],
    candidateRevision: {
      commit: "5".repeat(40), tree: "6".repeat(40), clean: true,
      buildArtifactId: id("build"),
    },
  };
  const document = attachIdentity(engine.SCHEMAS.promotion, payload);
  assert.throws(() => engine.validatePromotion(document), /does not clear the 11-pair 10% gate/);
});

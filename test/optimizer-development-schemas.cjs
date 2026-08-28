// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const common = require("../tools/optimizer-development/common.cjs");
const identity = require("../tools/optimizer-development/identity.cjs");
const reasons = require("../tools/optimizer-development/reason-codes.cjs");
const schemas = require("../tools/optimizer-development/schemas.cjs");

const FIXTURES = path.join(__dirname, "fixtures", "optimizer-development", "schemas");
const CONTRACTS = path.join(__dirname, "..", "architecture", "optimizer-development");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

const rawDigest = (character) => character.repeat(64);
const refId = (name) => common.contentIdentity("sagejs.optimizer-test-reference/v1", { name });

function addressed(schema, payload) {
  return JSON.parse(JSON.stringify(common.attachIdentity(schema, payload)));
}

function readdress(document) {
  const { schema, id: _id, ...payload } = document;
  return addressed(schema, payload);
}

test("wire schemas enumerate every frozen document boundary", () => {
  const documents = new Map([
    [schemas.SCHEMAS.workload, "workload-v1.schema.json"],
    [schemas.SCHEMAS.workloadCatalog, "workload-catalog-v1.schema.json"],
    [schemas.SCHEMAS.profile, "profile-receipt-v1.schema.json"],
    [schemas.SCHEMAS.overlay, "hotness-overlay-v1.schema.json"],
    [schemas.SCHEMAS.dossier, "dossier-v1.schema.json"],
    [schemas.SCHEMAS.campaign, "campaign-v1.schema.json"],
    [schemas.SCHEMAS.promotion, "promotion-receipt-v1.schema.json"],
  ]);
  for (const [instanceSchema, filename] of documents) {
    const document = JSON.parse(fs.readFileSync(path.join(CONTRACTS, filename), "utf8"));
    assert.equal(document.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(document.type, "object");
    assert.equal(document.additionalProperties, false);
    assert.equal(document.properties.schema.const, instanceSchema);
    assert.deepEqual(new Set(document.required), new Set(Object.keys(document.properties)));
  }
  const adversarial = fixture("adversarial-cases.json");
  assert.equal(adversarial.schema, "sagejs.optimizer-adversarial-schema-corpus/v1");
  assert.equal(adversarial.cases.length, 10);
  assert.equal(new Set(adversarial.cases.map((item) => item.id)).size, 10);
});

test("dashboard and runtime receipts share one compiler implementation identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-compiler-identity-"));
  try {
    const sourcePaths = [
      ...identity.COMPILER_SOURCE_ROOT_PATHS,
      "tools/python/optimizer/catalog.ts",
      "tools/python/optimizer/passes/example.ts",
    ];
    for (const filename of [...sourcePaths, ...identity.FRONTEND_ARTIFACT_PATHS]) {
      const target = path.join(root, filename);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `authenticated bytes for ${filename}\n`);
    }
    const optimizerCatalog = {
      plugins: [{
        id: "math.example-region.v1",
        domainId: "example-domain",
        priority: 100,
        claimSemantics: "exclusive",
        loweringIds: ["v8.example-loop.v1"],
        pass: {
          id: "math.example-region.v1",
          inputSchema: "sagejs.optimizer.ir/v2",
          factsConsumed: ["example.input"],
          factsProduced: ["example.output"],
          factsInvalidated: [],
          preserves: ["python.semantics"],
          acceptedLevel: "semantic",
          producedLevel: "representation",
          guardsIntroduced: ["example.guard"],
          supportedTargets: ["v8"],
          verifier: "example-verifier",
          compilationCostBudget: 10,
          codeSizeBudget: 20,
          requiredEvidence: ["example-evidence"],
          run() {},
        },
      }],
    };
    const implementation = identity.compilerImplementationIdentity(root, optimizerCatalog);
    const dashboard = identity.canonicalCompilerIdentity({
      root,
      irSchema: "sagejs.optimizer.ir/v2",
      optimizerCatalog,
      optionsDigest: common.sha256(common.canonicalJson({ level: "O2", explain: true })),
    });
    const runtime = identity.canonicalCompilerIdentity({
      root,
      irSchema: "sagejs.optimizer.ir/v2",
      optimizerCatalog,
      optionsDigest: common.sha256(common.canonicalJson({ level: "O2", explain: false })),
    });
    for (const compiler of [dashboard, runtime]) {
      assert.equal(compiler.compilerSourceBundleId, implementation.compilerSourceBundle.id);
      assert.equal(compiler.frontendDigest, implementation.frontendDigest);
      assert.equal(compiler.catalogDigest, implementation.catalogDigest);
    }
    assert.notEqual(dashboard.optionsDigest, runtime.optionsDigest);
    assert.notEqual(dashboard.id, runtime.id);
    fs.writeFileSync(path.join(root, "dist/compiler/compiler.js"), "different emitted compiler\n");
    const changedArtifact = identity.compilerImplementationIdentity(root, optimizerCatalog);
    assert.equal(changedArtifact.compilerSourceBundle.id, implementation.compilerSourceBundle.id);
    assert.equal(changedArtifact.catalogDigest, implementation.catalogDigest);
    assert.notEqual(changedArtifact.frontendDigest, implementation.frontendDigest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("compiler compatibility preserves distinct static and runtime options", () => {
  const commonFields = {
    irSchema: "sagejs.optimizing-mathematics/v1",
    compilerSourceBundleId: refId("shared-compiler-source"),
    frontendDigest: rawDigest("c"),
    catalogDigest: rawDigest("d"),
  };
  const dashboard = identity.compilerIdentity({
    ...commonFields,
    optionsDigest: common.sha256(common.canonicalJson({
      optimization_level: "O2", for_linting: true, runtime_imports: false,
    })),
  });
  const runtime = identity.compilerIdentity({
    ...commonFields,
    optionsDigest: common.sha256(common.canonicalJson({
      optimization_level: "O2", for_linting: false, runtime_imports: true,
    })),
  });
  assert.notEqual(dashboard.id, runtime.id);
  assert.equal(identity.compilerCompatibilityIdentity(dashboard).id,
    identity.compilerCompatibilityIdentity(runtime).id);
  assert.equal(identity.compilerImplementationsCompatible(dashboard, runtime), true);

  const staleFrontend = identity.compilerIdentity({
    ...commonFields,
    frontendDigest: rawDigest("e"),
    optionsDigest: runtime.optionsDigest,
  });
  assert.equal(identity.compilerImplementationsCompatible(dashboard, staleFrontend), false);
  const counterfeit = structuredClone(runtime);
  counterfeit.catalogDigest = rawDigest("f");
  assert.throws(() => identity.compilerCompatibilityIdentity(counterfeit), /is stale/);
});

function distribution(samples = [10, 11, 12]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    unit: "microseconds",
    samples,
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted[sorted.length - 1],
  };
}

function buildEvidence() {
  const workload = addressed(schemas.SCHEMAS.workload, {
    title: "Exact positive optimizer control",
    class: "positive-control",
    owner: "optimizer-team",
    runner: { kind: "fixture", path: "test/control.py", argv: [], environment: [] },
    input: {
      kind: "inline-json",
      digest: common.sha256(common.canonicalJson({ n: 10 })),
      seed: 17,
      value: { n: 10 },
    },
    corpus: { id: "small-control", digest: rawDigest("1") },
    oracles: [{
      id: "exact-digest", kind: "digest", runnerPath: null, expectedDigest: rawDigest("2"),
    }],
    phases: [{ id: "complete-workload", label: "Complete workload" }],
    protocol: { warmupRuns: 2, repetitions: 3, timeoutMilliseconds: 1000, reset: "evaluator" },
    capabilities: [],
    targets: ["generic"],
    modes: ["sage"],
    platforms: ["linux-x64"],
  });
  const catalog = addressed(schemas.SCHEMAS.workloadCatalog, { workloads: [workload] });
  const sourceBundle = identity.sourceBundleFromRecords([{
    path: "src/lib/control.py", digest: rawDigest("3"), bytes: 128,
  }]);
  const compiler = identity.compilerIdentity({
    irSchema: "sagejs.optimizing-mathematics/v1",
    compilerSourceBundleId: refId("compiler-sources"),
    frontendDigest: rawDigest("4"),
    catalogDigest: rawDigest("5"),
    optionsDigest: rawDigest("6"),
  });
  const artifact = common.attachIdentity("sagejs.optimizer-artifact/v1", {
    kind: "node-build", receiptDigest: rawDigest("7"),
  });
  const sourceUnit = identity.sourceUnitIdentity({
    path: "src/lib/control.py", digest: rawDigest("3"), language: "python",
  });
  const functionRecord = identity.functionIdentity({
    sourceUnitId: sourceUnit.id,
    qualifiedName: "control",
    kind: "function",
    semanticFingerprint: identity.semanticFingerprint({ kind: "AST_Defun", loops: 1 }),
    range: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 12 },
    ordinal: 0,
  });
  const region = identity.semanticRegionIdentity({
    functionId: functionRecord.id,
    kind: "AST_ForIn",
    semanticFingerprint: identity.semanticFingerprint({ kind: "AST_ForIn", operation: "+" }),
    range: { startLine: 3, startColumn: 4, endLine: 4, endColumn: 13 },
    ordinal: 0,
  });
  const decision = identity.decisionIdentity({
    regionId: region.id,
    passId: "math.bounded-integer-region.v1",
    compilerId: compiler.id,
  });
  const profile = addressed(schemas.SCHEMAS.profile, {
    authority: "host-workload-runner-phase-only",
    workload: { id: workload.id },
    sourceBundle,
    compiler,
    artifact,
    host: {
      platform: "linux", architecture: "x64", runtime: "node", runtimeVersion: "26.7.0",
      engine: "v8", engineVersion: "14.2",
    },
    capability: { runtime: "node", sourceSampling: "unavailable" },
    configuration: {
      target: "generic", mode: "sage", capabilities: [], environmentDigest: rawDigest("8"),
    },
    outcome: { status: "success", error: null },
    output: {
      digest: rawDigest("2"),
      oracleResults: [{ id: "exact-digest", status: "pass", digest: rawDigest("2") }],
    },
    compilation: distribution(),
    execution: { cold: distribution([20, 21, 22]), warm: distribution([10, 11, 12]) },
    phases: [{
      id: "complete-workload", cold: distribution([20, 21, 22]), warm: distribution(),
    }],
    sampling: {
      kind: "phase-only",
      intervalMicroseconds: 0,
      rawProfileDigest: null,
      timeDeltaMicroseconds: 0,
      scripts: [],
      mapBindings: [],
      functionSampleCounts: { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 },
      functionSamples: [],
      positionTickCounts: { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 },
      positionTicks: [],
    },
    optimizer: { reportDigest: rawDigest("9"), regions: [] },
    runtime: {
      authority: "unavailable",
      routeEventCounts: { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 },
      routeEvents: [],
    },
    counters: { boundaryCrossings: 0, copiedBytes: 0, materializations: 1, allocations: 1 },
    resources: { liveBefore: 0, liveAfter: 0, highWater: 1 },
    overhead: {
      method: "paired-alternating",
      samplingIntervalMicroseconds: 0,
      baselineRunsMicroseconds: [10, 10, 10],
      instrumentedRunsMicroseconds: [10, 10, 10],
      medianRatio: 1,
      reviewedMaximumRatio: 1.1,
      status: "pass",
    },
  });
  const dashboard = {
    id: refId("dashboard"),
    digest: rawDigest("a"),
    sourceBundleId: sourceBundle.id,
    compilerId: compiler.id,
  };
  const source = {
    path: "src/lib/control.py",
    range: region.range,
    sourceUnitId: sourceUnit.id,
    functionId: functionRecord.id,
    regionId: region.id,
  };
  const overlay = addressed(schemas.SCHEMAS.overlay, {
    dashboard,
    profiles: [{ id: profile.id, workloadId: workload.id, status: "current" }],
    joinPolicy: { minimumCoverage: 0.8, staleProfiles: "historical-only", ambiguity: "fail-closed" },
    regions: [{
      source,
      loopId: refId("dashboard-loop"),
      staticDecisions: [{
        decisionId: decision.id,
        passId: "math.bounded-integer-region.v1",
        status: "rejected",
        reasons: [{ code: "bounded-integer.dynamic-call", detail: {} }],
      }],
      observations: [{
        profileId: profile.id,
        workloadId: workload.id,
        entryCount: 3,
        inclusiveSamples: 8,
        exclusiveSamples: 6,
        wallFraction: 0.4,
        confidence: 0.9,
      }],
      runtimeRoutes: [],
      classification: "compiler-rejection",
      recommendedAction: "compiler-campaign",
      eligibility: { status: "eligible", reasons: [] },
      ranking: {
        removableWallLower: 0.2,
        affectedWorkloads: 1,
        nearMissDistance: 1,
        generality: 2,
        existingComponents: 1,
        semanticRisk: 1,
        compilationCost: 1,
        evidenceQuality: 0.9,
      },
      removableFraction: { lower: 0.2, upper: 0.4 },
    }],
    unmatched: [],
    summary: {
      currentProfiles: 1, historicalProfiles: 0, eligibleRegions: 1,
      staleRegions: 0, ambiguousRegions: 0,
    },
  });
  const legacyDecision = {
    schema: "sagejs.optimizing-mathematics/v1",
    id: "math.bounded-integer-region.v1@src/lib/control.py:3:4#0123456789abcdef",
    passId: "math.bounded-integer-region.v1",
    selected: false,
    rejectionReasons: ["bounded-integer.dynamic-call"],
  };
  const optimizerProgram = {
    schema: "sagejs.optimizing-mathematics/v1",
    level: "O2",
    regions: [legacyDecision],
  };
  const dossier = addressed(schemas.SCHEMAS.dossier, {
    status: "approved",
    classification: "compiler-rejection",
    recommendedAction: "compiler-campaign",
    source,
    evidence: { dashboardId: dashboard.id, overlayId: overlay.id, profileIds: [profile.id] },
    excerpt: { text: "for i in range(n):\n    x = helper(x)", digest: common.sha256("for i in range(n):\n    x = helper(x)") },
    currentIr: {
      reportDigest: common.sha256(common.canonicalJson(optimizerProgram)),
      program: optimizerProgram,
      decisionId: decision.id,
      legacyDecisionId: legacyDecision.id,
      passId: legacyDecision.passId,
      selected: false,
      decision: legacyDecision,
    },
    facts: {
      proven: [{ kind: "builtin-range", authority: "static", evidence: "Canonical range." }],
      guarded: [], unknown: [], invalidated: [],
    },
    rejections: [{ code: "bounded-integer.dynamic-call", detail: {} }],
    costs: {
      estimated: { boundaryCrossings: 3, copiedBytes: 0, materializations: 1, allocations: 3 },
      observed: { boundaryCrossings: 3, copiedBytes: 0, materializations: 1, allocations: 3 },
      dominant: "boundary",
    },
    candidates: [{
      id: "generic-fallback", target: "generic", representation: "boxed values",
      status: "selected", reason: null, inclusiveEvidence: "Current exact route.",
    }, {
      id: "v8-closed-region", target: "v8", representation: "primitive exact numbers",
      status: "rejected", reason: { code: "bounded-integer.dynamic-call", detail: {} },
      inclusiveEvidence: null,
    }],
    unresolvedProofs: ["known-call provenance"],
    suggestedContract: {
      requiredPassId: "math.bounded-integer-region.v1", coverage: "all-loops",
      target: "v8", guardFailure: "fallback",
    },
    witness: { path: "test/control.py", digest: rawDigest("b") },
    oracles: ["CPython exact output"],
    adversarialObligations: ["Mutated helper"],
    benchmarkObligations: ["Inclusive cold and warm benchmark"],
    generality: ["Other bounded helper loops"],
    negativeEvidence: ["Scalar native boundary is slower"],
    claims: ["tools/python/optimizer/passes/example.ts"],
    integration: { sharedFiles: ["tools/python/optimizer/index.ts"], owner: "integration" },
    promotionCriteria: {
      minimumEndToEndImprovement: 0.1, minimumPhaseImprovement: 0.5,
      maximumRegression: 0.03,
    },
  });
  const campaign = addressed(schemas.SCHEMAS.campaign, {
    status: "approved",
    baseCommit: "1".repeat(40),
    dossier: { id: dossier.id },
    hypothesis: "Known-call provenance permits one reusable bounded exact region.",
    selectionEvidence: ["Current authenticated workload profile"],
    interfaces: [{
      name: "region-identity", schema: "sagejs.optimizer-region-identity/v1",
      digest: rawDigest("c"), owner: "integration",
    }],
    targets: ["v8"],
    lanes: [{
      id: "integration",
      role: "integration",
      claims: ["tools/python/optimizer/index.ts"],
      dependencies: [],
      task: {
        id: "campaign-integration", branch: "agent/campaign-integration",
        contractPath: ".agents/tasks/campaign-integration.json",
        parallelNewArgs: ["campaign-integration", "native-compiler"],
      },
      deliverables: ["Integrated pass and receipt"],
    }],
    dependencies: [],
    oracles: ["CPython exact output"],
    acceptance: {
      minimumEndToEndImprovement: 0.1, minimumPhaseImprovement: 0.5,
      maximumRegression: 0.03, requiredConsumers: 2,
    },
    platforms: ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"],
    evidencePolicy: { id: "pilot-v1", digest: rawDigest("d") },
  });
  const policy = {
    id: "pilot-v1",
    digest: rawDigest("d"),
    minPairs: 11,
    bootstrapResamples: 1000,
    confidence: 0.95,
    bootstrapSeedDigest: rawDigest("e"),
    minimumEndToEndImprovement: 0.1,
    minimumPhaseImprovement: 0.5,
    minimumPhaseShare: 0.1,
    minimumPhaseEndToEndImprovement: 0.05,
    requiredConsumers: 2,
    maximumRegression: 0.03,
    requiredTargets: ["wasm"],
    requiredPlatforms: ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"],
    requiredBrowsers: ["chromium", "firefox", "webkit"],
  };
  const orders = ["AB", "BA", "BA", "AB"];
  const pairs = Array.from({ length: 11 }, (_, index) => ({
    order: orders[index % 4], baseline: 120 + index, candidate: 100 + index,
  }));
  const comparison = (salt, values = pairs) => ({
    unit: "microseconds",
    pairs: values,
    method: "paired-bootstrap-median-speedup-v1",
    ...schemas.computeComparisonStatistics(values, policy, salt),
    inclusive: true,
  });
  const baseline = {
    commit: "1".repeat(40), tree: "2".repeat(40), sourceBundleId: refId("baseline-source"),
    workspaceId: rawDigest("1"), clean: true, compilerId: refId("baseline-compiler"),
    artifactId: refId("baseline-artifact"), profileIds: [refId("baseline-profile")],
  };
  const candidate = {
    commit: "3".repeat(40), tree: "4".repeat(40), sourceBundleId: refId("candidate-source"),
    workspaceId: rawDigest("2"), clean: true, compilerId: refId("candidate-compiler"),
    artifactId: refId("candidate-artifact"), profileIds: [refId("candidate-profile")],
  };
  const build = {
    workspaceId: candidate.workspaceId, receiptDigest: rawDigest("f"), outputsDigest: rawDigest("0"),
  };
  const promotionArtifact = {
    kind: "browser-production",
    id: candidate.artifactId,
    sourceCommit: candidate.commit,
    sourceClosureId: refId("candidate-closure"),
    manifestDigest: rawDigest("a"),
    receiptDigest: rawDigest("b"),
  };
  const browserReceiptIds = {
    chromium: refId("browser-chromium"), firefox: refId("browser-firefox"),
    webkit: refId("browser-webkit"),
  };
  const promotionCore = {
    authority: "promotion-validator",
    campaign: { id: campaign.id },
    policy,
    baseline,
    candidate,
    build,
    artifact: promotionArtifact,
    workloads: [workload.id],
    correctness: [{ id: "exact-output", status: "pass", evidenceId: refId("correctness") }],
    compilerDelta: {
      beforeDecisionIds: [decision.id],
      afterDecisionIds: [refId("candidate-decision")],
      resolvedReasons: [{ code: "bounded-integer.dynamic-call", detail: {} }],
      introducedReasons: [],
    },
    routes: [{
      id: "v8-route", status: "pass", evidenceId: refId("route"),
      passId: "math.bounded-integer-region.v1", lowering: "v8.bounded-integer.v1",
      representation: "primitive exact numbers", target: "v8", fallbackId: "semantic:control",
      runtimeAuthenticated: true, o0Selected: false, o2Selected: true, guardFallback: "pass",
    }],
    performance: {
      endToEnd: comparison(`${campaign.id}:${workload.id}:end-to-end`),
      phase: null,
    },
    costs: {
      baseline: { boundaryCrossings: 20, copiedBytes: 100, materializations: 20, allocations: 30 },
      candidate: { boundaryCrossings: 0, copiedBytes: 0, materializations: 1, allocations: 1 },
    },
    resources: [{
      id: "resident-memory", evidenceId: refId("resources"),
      ceilings: [{ metric: "high-water-bytes", unit: "bytes", limit: 1000, observed: 900 }],
    }],
    platforms: ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"].map((platform) => ({
      id: platform, availability: "available", evidenceId: refId(`platform-${platform}`), failures: [],
    })),
    baselineExceptions: [],
    browsers: ["chromium", "firefox", "webkit"].map((engine) => ({
      engine, availability: "available", receiptId: browserReceiptIds[engine],
    })),
    dashboardDelta: {
      beforeId: dashboard.id, afterId: refId("candidate-dashboard"),
      resolvedRegions: [region.id], introducedRegions: [],
    },
    adversarial: [{ id: "mutated-helper", status: "pass", evidenceId: refId("adversarial") }],
    neighboring: [{
      workloadId: refId("neighbor"),
      comparison: comparison(`${campaign.id}:neighbor:${refId("neighbor")}`,
        Array.from({ length: 11 }, (_, index) => ({
          order: orders[index % 4], baseline: 100 + index, candidate: 100 + index,
        }))),
    }],
    losingCandidates: [{
      target: "wasm", status: "measured-slower", evidenceId: refId("losing-wasm"),
      reason: "Inclusive conversion costs dominate this region.",
    }],
  };
  const promotionContext = {
    campaignId: campaign.id,
    currentCheckout: {
      ...candidate,
    },
    currentBuild: build,
    currentArtifact: {
      id: promotionArtifact.id,
      sourceCommit: promotionArtifact.sourceCommit,
      sourceClosureId: promotionArtifact.sourceClosureId,
      manifestDigest: promotionArtifact.manifestDigest,
      receiptDigest: promotionArtifact.receiptDigest,
    },
    validatedBrowserReceiptIds: Object.values(browserReceiptIds),
    validatedInputs: {
      campaignIds: [campaign.id],
      sourceBundleIds: [baseline.sourceBundleId, candidate.sourceBundleId].sort(),
      compilerIds: [baseline.compilerId, candidate.compilerId].sort(),
      artifactIds: [baseline.artifactId, candidate.artifactId].sort(),
      profileIds: [...baseline.profileIds, ...candidate.profileIds].sort(),
      workloadIds: [workload.id],
      correctnessEvidenceIds: promotionCore.correctness.map((item) => item.evidenceId),
      adversarialEvidenceIds: promotionCore.adversarial.map((item) => item.evidenceId),
      routeEvidenceIds: promotionCore.routes.map((item) => item.evidenceId),
      resourceEvidenceIds: promotionCore.resources.map((item) => item.evidenceId),
      platformEvidenceIds: promotionCore.platforms.map((item) => item.evidenceId).sort(),
      neighboringWorkloadIds: promotionCore.neighboring.map((item) => item.workloadId),
      losingCandidateEvidenceIds: promotionCore.losingCandidates.map((item) => item.evidenceId),
      dashboardIds: [
        promotionCore.dashboardDelta.beforeId, promotionCore.dashboardDelta.afterId,
      ].sort(),
      compilerDecisionIds: [
        ...promotionCore.compilerDelta.beforeDecisionIds,
        ...promotionCore.compilerDelta.afterDecisionIds,
      ].sort(),
    },
  };
  const bindings = {
    checkout: "verified", build: "verified", artifact: "verified", evidence: "verified",
    browsers: ["chromium", "firefox", "webkit"],
  };
  const promotion = addressed(schemas.SCHEMAS.promotion, {
    ...promotionCore,
    decision: schemas.promotionDecision(promotionCore, bindings),
  });
  return {
    workload, catalog, profile, overlay, dossier, campaign, promotion, promotionContext,
    sourceBundle, compiler, artifact, sourceUnit, functionRecord, region, decision,
  };
}

function realIdentities() {
  const input = fixture("real-optimizer-region.json");
  const sourceUnit = identity.sourceUnitIdentity({
    path: input.sourcePath,
    digest: input.sourceDigest,
    language: "python",
  });
  const functionFingerprint = identity.semanticFingerprint(input.function.semanticStructure);
  const functionRecord = identity.functionIdentity({
    sourceUnitId: sourceUnit.id,
    qualifiedName: input.function.qualifiedName,
    kind: input.function.kind,
    semanticFingerprint: functionFingerprint,
    range: input.function.range,
    ordinal: input.function.ordinal,
  });
  const regionFingerprint = identity.semanticFingerprint(input.region.semanticStructure);
  const region = identity.semanticRegionIdentity({
    functionId: functionRecord.id,
    kind: input.region.kind,
    semanticFingerprint: regionFingerprint,
    range: input.region.range,
    ordinal: input.region.ordinal,
  });
  const compilerBundleId = common.contentIdentity("fixture.compiler-source/v1", {
    files: ["tools/python/optimizer/index.ts", "src/parse.ts"],
  });
  const compiler = identity.compilerIdentity({
    irSchema: "sagejs.optimizing-mathematics/v1",
    compilerSourceBundleId: compilerBundleId,
    frontendDigest: "1".repeat(64),
    catalogDigest: "2".repeat(64),
    optionsDigest: "3".repeat(64),
  });
  const decision = identity.decisionIdentity({
    regionId: region.id,
    passId: input.passId,
    compilerId: compiler.id,
  });
  return { sourceUnit, functionRecord, region, compiler, decision };
}

test("canonical JSON and identities are independent of property order", () => {
  assert.equal(common.canonicalJson({ z: 1, a: { d: 2, b: 3 } }),
    common.canonicalJson({ a: { b: 3, d: 2 }, z: 1 }));
  assert.equal(identity.semanticFingerprint({ z: 1, a: 2 }),
    identity.semanticFingerprint({ a: 2, z: 1 }));
  assert.match(identity.semanticFingerprint({ a: 2 }), /^sha256:[0-9a-f]{64}$/);
});

test("production optimizer names and AST kinds form deterministic identities", () => {
  const first = realIdentities();
  const second = realIdentities();
  assert.deepEqual(first, second);
  assert.equal(first.decision.passId, "math.bounded-integer-region.v1");
  assert.equal(first.region.kind, "AST_ForIn");
  assert.ok(Object.isFrozen(first.region));
  assert.ok(Object.isFrozen(first.region.range));
  assert.throws(() => {
    first.region.range.startLine = 99;
  }, TypeError);
});

test("source-bundle identities ignore checkout location", () => {
  const left = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-identity-left-"));
  const right = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-identity-right-"));
  try {
    for (const root of [left, right]) {
      fs.mkdirSync(path.join(root, "src", "lib"), { recursive: true });
      fs.writeFileSync(path.join(root, "src", "lib", "sample.py"), "def f(x):\n    return x + 1\n");
    }
    assert.deepEqual(
      identity.sourceBundleIdentity(left, ["src/lib/sample.py"]),
      identity.sourceBundleIdentity(right, ["src/lib/sample.py"]),
    );
  } finally {
    fs.rmSync(left, { recursive: true });
    fs.rmSync(right, { recursive: true });
  }
});

test("identity inputs reject host paths and malformed stable names", () => {
  assert.throws(() => identity.sourceUnitIdentity({
    path: "/tmp/source.py", digest: "0".repeat(64), language: "python",
  }), /repository-relative/);
  const { region, compiler } = realIdentities();
  assert.throws(() => identity.decisionIdentity({
    regionId: region.id, passId: "invalid pass", compilerId: compiler.id,
  }), /stable dot/);
});

test("predecessors require one unique semantic match", () => {
  const fingerprint = identity.semanticFingerprint({ kind: "AST_ForIn", operation: "+" });
  const current = {
    id: `sha256:${"a".repeat(64)}`,
    path: "src/lib/a.py",
    qualifiedName: "f",
    kind: "for-loop",
    semanticFingerprint: fingerprint,
  };
  const previous = { ...current, id: `sha256:${"b".repeat(64)}` };
  assert.equal(identity.linkPredecessor([previous], current), previous.id);
  assert.equal(identity.linkPredecessor([previous, { ...previous, id: `sha256:${"c".repeat(64)}` }], current), null);
});

test("the checked reason registry accepts structured and legacy detailed reasons", () => {
  assert.equal(reasons.DEFAULT_REASON_REGISTRY.schema,
    "sagejs.optimizer-reason-registry/v1");
  assert.deepEqual(
    reasons.validateReason("bounded-integer.unsupported-operation://"),
    { code: "bounded-integer.unsupported-operation", detail: { operator: "//" } },
  );
  assert.throws(() => reasons.validateReason({ code: "invented.reason", detail: {} }),
    /unknown reason code/);
  assert.throws(() => reasons.validateReason({
    code: "bounded-integer.unsupported-operation", detail: {},
  }), /fields must be exactly operator/);
});

test("all evidence documents validate, detach, and freeze", () => {
  const evidence = buildEvidence();
  const validated = [
    schemas.validateWorkload(evidence.workload),
    schemas.validateWorkloadCatalog(evidence.catalog),
    schemas.validateProfileReceipt(evidence.profile, {
      workloadId: evidence.workload.id,
      sourceBundleId: evidence.sourceBundle.id,
      compilerId: evidence.compiler.id,
      artifactId: evidence.artifact.id,
    }),
    schemas.validateHotnessOverlay(evidence.overlay, {
      dashboardId: evidence.overlay.dashboard.id,
    }),
    schemas.validateDossier(evidence.dossier, {
      overlayId: evidence.overlay.id,
      compilerDecision: {
        decisionId: evidence.decision.id,
        passId: "math.bounded-integer-region.v1",
        selected: false,
      },
    }),
    schemas.validateCampaign(evidence.campaign, { dossierId: evidence.dossier.id }),
    schemas.validatePromotionReceipt(evidence.promotion, evidence.promotionContext),
  ];
  for (const document of validated) {
    assert.ok(Object.isFrozen(document));
    assert.match(document.id, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(schemas.validateBySchema(document,
      document.schema === schemas.SCHEMAS.promotion ? evidence.promotionContext : {}), document);
  }
  assert.equal(validated.at(-1).decision.status, "accepted");
});

test("unknown fields and stale content identities fail closed", () => {
  const { workload } = buildEvidence();
  const unknown = structuredClone(workload);
  unknown.unreviewed = true;
  assert.throws(() => schemas.validateWorkload(unknown), /unknown|fields must be exactly/);
  const stale = structuredClone(workload);
  stale.title = "Changed without a new identity";
  assert.throws(() => schemas.validateWorkload(stale), /is stale/);
});

test("counterfeit authorities, malformed counters, and unknown reasons fail closed", () => {
  const evidence = buildEvidence();
  const counterfeit = structuredClone(evidence.profile);
  counterfeit.authority = "user-output";
  assert.throws(() => schemas.validateProfileReceipt(readdress(counterfeit)), /authority/);

  const counter = structuredClone(evidence.profile);
  counter.counters.copiedBytes = -1;
  assert.throws(() => schemas.validateProfileReceipt(readdress(counter)), /safe integer/);

  const unknownReason = structuredClone(evidence.overlay);
  unknownReason.regions[0].staticDecisions[0].reasons = [{ code: "agent.claimed-fast", detail: {} }];
  assert.throws(() => schemas.validateHotnessOverlay(readdress(unknownReason)),
    /unknown reason code/);
});

test("sampling channels conserve independently and authenticate only attributed scripts", () => {
  const evidence = buildEvidence();
  const broken = structuredClone(evidence.profile);
  broken.sampling.functionSampleCounts.total = 1;
  assert.throws(() => schemas.validateProfileReceipt(readdress(broken)), /must be 0/);

  const forged = structuredClone(evidence.profile);
  forged.authority = "host-collector-with-private-evaluator-evidence";
  forged.sampling.kind = "v8-cpu";
  forged.sampling.rawProfileDigest = rawDigest("f");
  forged.sampling.functionSampleCounts = { total: 1, attributed: 0, ambiguous: 0, unmatched: 1 };
  forged.sampling.functionSamples = [{
    nodeId: 1,
    samples: 1,
    generated: {
      scriptId: "forged", url: "sagejs-profile://nonce/source.js", functionName: "f",
      line: 1, column: 0,
    },
    mapping: { status: "unmatched", candidates: [] },
  }];
  forged.runtime.authority = "private-evaluator-closure";
  assert.doesNotThrow(() => schemas.validateProfileReceipt(readdress(forged)));

  const counterfeitMapping = structuredClone(forged);
  counterfeitMapping.sampling.functionSampleCounts = {
    total: 1, attributed: 1, ambiguous: 0, unmatched: 0,
  };
  counterfeitMapping.sampling.functionSamples[0].mapping = {
    status: "attributed",
    candidates: [{
      sourceUnitId: evidence.sourceUnit.id,
      functionId: evidence.functionRecord.id,
      path: "src/lib/control.py",
      range: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 12 },
      confidence: 1,
    }],
  };
  assert.throws(() => schemas.validateProfileReceipt(readdress(counterfeitMapping)),
    /no authenticated source bytes/);
});

test("terminal route outcomes distinguish fast, fallback, zero-trip, and guard error", () => {
  const { profile } = buildEvidence();
  const withEvent = (outcome, reason) => {
    const receipt = structuredClone(profile);
    receipt.authority = "host-collector-with-private-evaluator-evidence";
    receipt.runtime.authority = "private-evaluator-closure";
    receipt.runtime.routeEventCounts = {
      total: 1, attributed: 0, ambiguous: 0, unmatched: 1,
    };
    receipt.runtime.routeEvents = [{
      optimizerRegionId: "legacy-region-1",
      regionKind: "bounded-integer-region",
      outcome,
      count: 1,
      reason,
      mapping: { status: "unmatched", candidates: [] },
    }];
    return readdress(receipt);
  };
  const guardReason = {
    code: "telemetry.guard-failure",
    detail: { guard: "bounded-intermediate-overflow" },
  };
  for (const outcome of [
    "selected-static-entry", "guarded-fast", "zero-trip", "completed",
  ]) {
    assert.doesNotThrow(() => schemas.validateProfileReceipt(withEvent(outcome, null)));
  }
  for (const outcome of ["guarded-fallback", "error"]) {
    assert.doesNotThrow(() => schemas.validateProfileReceipt(withEvent(outcome, guardReason)));
    assert.throws(() => schemas.validateProfileReceipt(withEvent(outcome, null)),
      /reason.*required exactly/);
  }
  assert.throws(() => schemas.validateProfileReceipt(withEvent("guarded-fast", guardReason)),
    /reason.*required exactly/);
  assert.throws(() => schemas.validateProfileReceipt(withEvent("guard-failure", guardReason)),
    /one of/);
  assert.throws(() => schemas.validateProfileReceipt(withEvent("guarded-fallback", {
    code: "telemetry.route-unavailable", detail: { target: "v8" },
  })), /must be telemetry.guard-failure/);
});

test("promotion summaries and current bindings are recomputed", () => {
  const evidence = buildEvidence();
  const falsified = structuredClone(evidence.promotion);
  falsified.performance.endToEnd.medianSpeedup = 99;
  assert.throws(() => schemas.validatePromotionReceipt(
    readdress(falsified), evidence.promotionContext,
  ), /does not match paired bootstrap/);

  assert.throws(() => schemas.validatePromotionReceipt(evidence.promotion),
    /independently recomputed decision/);

  const wrongCheckout = structuredClone(evidence.promotionContext);
  wrongCheckout.currentCheckout.commit = "9".repeat(40);
  assert.throws(() => schemas.validatePromotionReceipt(evidence.promotion, wrongCheckout),
    /independently recomputed decision/);

  const counterfeitSource = structuredClone(evidence.promotionContext);
  counterfeitSource.currentCheckout.sourceBundleId = refId("counterfeit-source");
  assert.throws(() => schemas.validatePromotionReceipt(evidence.promotion, counterfeitSource),
    /independently recomputed decision/);

  const counterfeitEvidence = structuredClone(evidence.promotion);
  counterfeitEvidence.routes[0].evidenceId = refId("counterfeit-route-evidence");
  assert.throws(() => schemas.validatePromotionReceipt(
    readdress(counterfeitEvidence), evidence.promotionContext,
  ), /independently recomputed decision/);
});

test("campaign claims and dossier compiler evidence cannot be counterfeit", () => {
  const evidence = buildEvidence();
  const campaign = structuredClone(evidence.campaign);
  const duplicate = structuredClone(campaign.lanes[0]);
  duplicate.id = "second-lane";
  duplicate.task.id = "second-task";
  duplicate.task.branch = "agent/second-task";
  duplicate.task.contractPath = ".agents/tasks/second-task.json";
  campaign.lanes.push(duplicate);
  campaign.lanes.sort((left, right) => left.id.localeCompare(right.id));
  assert.throws(() => schemas.validateCampaign(readdress(campaign)), /claim .* is shared/);

  const dossier = structuredClone(evidence.dossier);
  dossier.currentIr.selected = true;
  assert.throws(() => schemas.validateDossier(readdress(dossier)),
    /copied pass and selection do not match/);
});

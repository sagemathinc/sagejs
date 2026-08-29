// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  canonicalJson,
  sha256,
} = require("../tools/optimizer-development/common.cjs");
const contracts = require("../tools/optimization-engine/contracts.cjs");
const {
  DISCOVERY_SCHEMA,
  adjudicateCampaign2,
  analyzeBundle,
  validateBundle,
} = require("../bench/optimization-engine/campaign2-discovery.cjs");
const {
  PHASES,
  campaign2Workloads,
  loadSpecifications,
  workloadIndex,
} = require("../bench/optimization-engine/campaign2-workloads.cjs");

const root = path.resolve(__dirname, "..");
const id = (name) => `sha256:${sha256(name)}`;
const digest = (name) => sha256(name);

function epoch(workloads = campaign2Workloads(root)) {
  return contracts.createDocument("epoch", {
    authority: {
      kind: "trusted-integration",
      producer: "test.campaign2-evidence",
      validatedInputIds: workloads.map((workload) => workload.id).sort(),
    },
    revision: {
      commit: "1".repeat(40), tree: "2".repeat(40), clean: true,
      repositorySourceClosureId: id("campaign2-source-closure"),
    },
    build: {
      receiptPath: "dist/build-receipt.json",
      receiptDigest: digest("campaign2-build-receipt"),
      outputManifestId: id("campaign2-output-manifest"),
      outputDigest: digest("campaign2-output"),
      sourceClosureId: id("campaign2-source-closure"),
    },
    catalogId: id("campaign2-workload-catalog"),
    workloadIds: workloads.map((workload) => workload.id).sort(),
    runtime: {
      node: process.version,
      engine: "v8-test",
      operatingSystem: "linux",
      architecture: "x64",
      capabilities: ["flint", "smalljac"],
    },
    components: [],
    profiler: {
      protocolId: id("campaign2-paired-protocol"),
      calibrationId: id("campaign2-calibration"),
    },
    reasonRegistryId: id("campaign2-reasons"),
    schemaRegistryId: id("campaign2-schemas"),
    producer: {
      implementationId: id("campaign2-epoch-producer"),
      argv: ["test", "optimization-campaign2-evidence"],
    },
  });
}

function pairs(name, baseline = 1000, candidate = 500) {
  return Array.from({ length: 11 }, (_, index) => ({
    order: index % 2 === 0 ? "ABBA" : "BAAB",
    baselineMicroseconds: baseline + index,
    candidateMicroseconds: candidate + index,
    baselineOutputDigest: digest(`${name}-exact-output`),
    candidateOutputDigest: digest(`${name}-exact-output`),
  }));
}

function counters(base, crossingCount) {
  return {
    conversionMicroseconds: Array.from({ length: 11 }, (_, index) => base + index / 10),
    crossings: Array(11).fill(crossingCount),
    copiedBytes: Array(11).fill(base * 128),
    allocations: Array(11).fill(base),
    resultConstructions: Array(11).fill(1),
    liveBefore: Array(11).fill(0),
    liveAfter: Array(11).fill(0),
    highWater: Array(11).fill(base),
  };
}

function alternatives(family) {
  return [
    ["algorithm", "new mathematical algorithm"],
    ["boundary", "boundary-only batching"],
    ["cache", "cache prior answers"],
    ["compiler", "V8 and Wasm compiler targets"],
    ["representation", "persistent alternate representation"],
    ["runtime", "runtime dispatch specialization"],
    ["source", "ordinary source rewrite"],
  ].map(([category, mechanism]) => ({
    category,
    mechanism,
    disposition: category === "compiler" ? "inferior" : "not-causal",
    evidenceDigest: digest(`${family}-${category}-negative-evidence`),
  }));
}

function entriesByFamily() {
  const grouped = new Map();
  for (const entry of workloadIndex(root).values()) {
    const list = grouped.get(entry.specification.family) || [];
    list.push(entry);
    grouped.set(entry.specification.family, list);
  }
  return grouped;
}

function bundle(currentEpoch, family, options = {}) {
  const entries = entriesByFamily().get(family);
  const specification = entries[0].specification;
  const baseline = options.baseline ?? 1000;
  const candidate = options.candidate ?? 500;
  const interruption = options.interruption ?? "complete";
  return {
    schema: DISCOVERY_SCHEMA,
    epochId: currentEpoch.id,
    family,
    provenance: {
      producerCommand: `node bench/optimization-engine/campaign2-discovery.cjs measure ${family}`,
      artifactDigest: digest(`${family}-artifact`),
      recordedAt: "2026-08-29T12:00:00.000Z",
    },
    matureCapability: {
      status: options.capabilityStatus ?? "available",
      capabilityId: id(`${family}-capability`),
      libraryArtifactId: id(`${family}-library-artifact`),
      declarationId: id(`${family}-declaration`),
      capabilityAuditComplete: true,
      batchingComplete: true,
      residencyComplete: true,
      interruption: {
        status: interruption,
        policy: interruption === "complete" ? "bounded call with worker rollback" : "no reviewed interrupt authority",
        boundedCall: interruption === "complete",
        workerIsolation: interruption === "complete",
      },
    },
    semantics: {
      outputEquivalent: options.outputEquivalent ?? true,
      exceptionEquivalent: true,
      proofModeEquivalent: true,
      transformationVerified: true,
      noPartialPublication: true,
      guardedFallback: true,
      failureCasesVerified: true,
    },
    platform: {
      nativePlatforms: ["linux-arm64", "linux-x64", "macos-arm64"],
      fallbackPlatforms: ["windows-x64"],
      fallbackBrowsers: ["chromium", "firefox", "webkit"],
      correctFallback: true,
      capabilityGuardBeforeEffects: true,
    },
    boundary: {
      complete: true,
      included: specification.costBoundary.included,
      excluded: specification.costBoundary.excluded,
      roles: entries.map((entry) => ({
        role: entry.workload.role,
        workloadId: entry.workload.id,
        pairs: pairs(`${family}-${entry.workload.role}`, baseline, candidate),
        baseline: counters(5, 5),
        candidate: counters(2, 2),
        cleanupComplete: true,
      })),
    },
    alternatives: alternatives(family),
    nativeAlternative: {
      mechanism: "new handwritten native implementation",
      disposition: "duplicate-mature-capability",
      evidenceDigest: digest(`${family}-handwritten-native-negative-evidence`),
    },
  };
}

test("Campaign 2 defines three exact representative/held-out v2 workload pairs", () => {
  const specifications = loadSpecifications(root);
  const workloads = campaign2Workloads(root);
  assert.equal(specifications.subjects.length, 6);
  assert.equal(workloads.length, 6);
  assert.equal(new Set(workloads.map((workload) => workload.id)).size, 6);
  for (const workload of workloads) {
    assert.deepEqual(contracts.validateWorkload(workload), workload);
    assert.equal(workload.protocol.repetitions, 11);
    assert.equal(workload.materiality.minimumPairs, 11);
    assert.equal(workload.materiality.minimumWorstPairFraction, 0.1);
    assert.ok(workload.phases.some((phase) =>
      phase.id === "complete-public" && phase.timing === "inclusive"));
    assert.ok(workload.instrumentation.includes("inclusive-timer"));
    assert.equal(workload.authority.validatedInputIds[0], workload.sourceClosureId);
  }
  for (const [family, phases] of Object.entries(PHASES)) {
    assert.ok(phases.every((phase, index) => index === 0 ||
      phases[index - 1].id.localeCompare(phase.id) < 0), family);
    const roles = specifications.subjects.filter((subject) => subject.family === family)
      .map((subject) => subject.role).sort();
    assert.deepEqual(roles, ["held-out", "representative"]);
  }
  const heldOutIntegral = specifications.subjects.find(
    (subject) => subject.key === "dense-integral-held-out",
  );
  assert.equal(
    heldOutIntegral.corpus.id,
    "dense-integral-gf257-thirty-eight-holes",
  );
  const definition = heldOutIntegral.corpus.definition;
  const holeCount = Array.from(
    { length: definition.degree + 1 },
    (_, index) => index,
  ).filter((index) => (index + 1) % definition.modulus === 0).length;
  assert.equal(holeCount, 38);
  const specificationSchema = require(
    "../architecture/optimization-engine/workloads/campaign2-specifications.schema.json"
  );
  const heldOutConditional = specificationSchema.properties.subjects.items.allOf[0].then
    .properties.corpus;
  assert.equal(
    heldOutConditional.properties.id.const,
    "dense-integral-gf257-thirty-eight-holes",
  );
  assert.equal(heldOutConditional.properties.definition.properties.degree.const, 9999);
});

test("workload identities bind the exact current source closure and oracle definitions", () => {
  const first = campaign2Workloads(root);
  const second = campaign2Workloads(root);
  assert.deepEqual(second, first);
  const index = workloadIndex(root);
  for (const [key, entry] of index) {
    const expectedCorpusDigest = sha256(canonicalJson({
      id: entry.specification.corpus.id,
      provenance: entry.specification.corpus.provenance,
      definition: entry.specification.corpus.definition,
    }));
    assert.equal(entry.workload.corpus.digest, expectedCorpusDigest, key);
    assert.match(entry.workload.sourceClosureId, /^sha256:[0-9a-f]{64}$/);
    assert.ok(entry.workload.oracles.length >= 2);
  }
});

test("discovery bundles require complete 11-pair and resource/crossing accounting", () => {
  const currentEpoch = epoch();
  const grouped = entriesByFamily();
  for (const family of grouped.keys()) {
    const checked = validateBundle(bundle(currentEpoch, family), currentEpoch, grouped.get(family));
    assert.equal(checked.boundary.roles.length, 2);
    assert.ok(checked.boundary.roles.every((role) => role.pairs.length === 11));
    assert.ok(checked.boundary.roles.every((role) => role.candidate.copiedBytes.length === 11));
  }
  const malformed = bundle(currentEpoch, "dense-integral");
  malformed.boundary.roles[0].candidate.crossings.pop();
  assert.throws(
    () => validateBundle(malformed, currentEpoch, grouped.get("dense-integral")),
    /exactly 11/,
  );
});

test("adjudication selects the integral, rejects an immaterial cubic phase, and investigates interruption", () => {
  const currentEpoch = epoch();
  const result = adjudicateCampaign2({
    root,
    epoch: currentEpoch,
    bundles: [
      bundle(currentEpoch, "dense-integral", { baseline: 2000, candidate: 200 }),
      bundle(currentEpoch, "cubic-factorization", { baseline: 1000, candidate: 950 }),
      bundle(currentEpoch, "hyperelliptic-normalization", { interruption: "missing" }),
    ],
  });
  assert.equal(result.adjudication.status, "select");
  assert.deepEqual(
    Object.fromEntries(result.familyDispositions.map((item) => [item.family, item.disposition])),
    {
      "cubic-factorization": "reject",
      "dense-integral": "select",
      "hyperelliptic-normalization": "investigate",
    },
  );
  const cubic = result.familyDispositions.find((item) => item.family === "cubic-factorization");
  assert.ok(cubic.failedGates.includes("worst-pair-ten-percent"));
  const hyper = result.familyDispositions.find(
    (item) => item.family === "hyperelliptic-normalization",
  );
  assert.ok(hyper.failedGates.includes("current-epoch-identities") === false);
});

test("exact semantics and cleanup failures cannot pass hard gates", () => {
  const currentEpoch = epoch();
  const grouped = entriesByFamily();
  const semantic = analyzeBundle({
    epoch: currentEpoch,
    bundle: bundle(currentEpoch, "dense-integral", { outputEquivalent: false }),
    entries: grouped.get("dense-integral"),
  });
  assert.equal(semantic.candidate.feasibility.outputEquivalent, false);
  assert.equal(semantic.candidate.feasibility.semanticObligationsResolved, false);

  const leak = bundle(currentEpoch, "dense-integral");
  leak.boundary.roles[0].candidate.liveAfter[4] = 1;
  const leaked = analyzeBundle({
    epoch: currentEpoch, bundle: leak, entries: grouped.get("dense-integral"),
  });
  assert.equal(leaked.candidate.feasibility.costBoundaryComplete, false);
});

test("cross-epoch evidence and incomplete workload epochs fail closed", () => {
  const currentEpoch = epoch();
  const grouped = entriesByFamily();
  const stale = bundle(currentEpoch, "dense-integral");
  stale.epochId = id("old-epoch");
  assert.throws(
    () => validateBundle(stale, currentEpoch, grouped.get("dense-integral")),
    /must equal the discovery epoch/,
  );
  const incomplete = epoch(campaign2Workloads(root).slice(0, 5));
  assert.throws(
    () => adjudicateCampaign2({
      root,
      epoch: incomplete,
      bundles: [
        bundle(incomplete, "dense-integral"),
        bundle(incomplete, "cubic-factorization"),
        bundle(incomplete, "hyperelliptic-normalization"),
      ],
    }),
    /does not bind 1 reviewed Campaign 2 workloads/,
  );
});

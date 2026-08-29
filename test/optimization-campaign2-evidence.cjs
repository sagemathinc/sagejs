// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  canonicalJson,
  contentIdentity,
  sha256,
} = require("../tools/optimizer-development/common.cjs");
const contracts = require("../tools/optimization-engine/contracts.cjs");
const {
  canonicalRecordStream,
  parseCanonicalRecordStream,
} = require("../tools/optimization-engine/evidence-store.cjs");
const {
  ADJUDICATION_SCHEMA,
  ALTERNATIVE_CATEGORIES,
  AUTHORITATIVE_INPUT_SCHEMA,
  BLOCKER_FAILED_GATES,
  BLOCKER_SCHEMA,
  CAPABILITY_AUTHORITY_SCHEMA,
  DECLARATION_AUTHORITY_SCHEMA,
  DISCOVERY_SCHEMA,
  adjudicateCampaign2,
  validateAuthoritativeInput,
  validateBlocker,
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
const RECORDED_AT = "2026-08-29T12:00:00.000Z";
const LIBRARY_ARTIFACT_ID = id("campaign2-library-artifact");
const BOUNDARIES = Object.freeze({
  "cubic-factorization": [
    "ffi:flint:nmod_poly_factor",
    "napi:@sagemath/sagejs-flint:nfFactorDegreesBatch",
  ],
  "dense-integral": ["ffi:flint:nmod_poly_integral"],
  "hyperelliptic-normalization": [
    "napi:@sagemath/sagejs-flint:smalljacLpolyBatch",
  ],
});

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
    components: [{
      kind: "native-artifact",
      id: LIBRARY_ARTIFACT_ID,
      digest: digest("campaign2-library-artifact-bytes"),
    }],
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

function alternatives(family, evidenceDigests = {}) {
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
    evidenceDigest: evidenceDigests[category] ??
      digest(`${family}-${category}-negative-evidence`),
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

function logicalDocument(schema, payload) {
  return { schema, id: contentIdentity(schema, payload), ...payload };
}

function authorityDocuments(currentEpoch, family, options = {}) {
  const registryPath = "architecture/native-boundaries.json";
  const registryDigest = sha256(fs.readFileSync(path.join(root, registryPath)));
  const declaration = logicalDocument(DECLARATION_AUTHORITY_SCHEMA, {
    epochId: options.epochId ?? currentEpoch.id,
    family,
    registryPath,
    registryDigest,
    boundaryIds: BOUNDARIES[family],
    recordedAt: RECORDED_AT,
  });
  const capability = logicalDocument(CAPABILITY_AUTHORITY_SCHEMA, {
    epochId: options.epochId ?? currentEpoch.id,
    family,
    status: "available",
    boundaryId: BOUNDARIES[family][0],
    libraryArtifactId: LIBRARY_ARTIFACT_ID,
    declarationId: declaration.id,
    recordedAt: RECORDED_AT,
  });
  return { capability, declaration };
}

function bundle(currentEpoch, family, authority, artifactDigest, options = {}) {
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
      artifactDigest,
      recordedAt: options.recordedAt ?? RECORDED_AT,
      timingAuthority: options.timingAuthority ?? "real",
    },
    matureCapability: {
      status: options.capabilityStatus ?? "available",
      capabilityId: authority.capability.id,
      libraryArtifactId: LIBRARY_ARTIFACT_ID,
      declarationId: authority.declaration.id,
      capabilityAuditComplete: true,
      batchingComplete: true,
      residencyComplete: true,
      interruption: {
        status: interruption,
        policy: interruption === "complete" ? "bounded call with worker rollback" :
          "no reviewed interrupt authority",
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
      fallbackBrowsers: [...new Set(entries.flatMap((entry) =>
        entry.workload.browsers))].sort(),
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
    alternatives: alternatives(family, options.alternativeEvidenceDigests),
    nativeAlternative: {
      mechanism: "new handwritten native implementation",
      disposition: "duplicate-mature-capability",
      evidenceDigest: options.nativeAlternativeEvidenceDigest ??
        digest(`${family}-handwritten-native-negative-evidence`),
    },
  };
}

function blocker(currentEpoch, family, authority, artifactDigest, options = {}) {
  const cubic = family === "cubic-factorization";
  const failedGates = cubic ? [...BLOCKER_FAILED_GATES]
    : [...new Set([
      ...BLOCKER_FAILED_GATES,
      ...(options.additionalFailedGates ?? ["semantic-obligations"]),
    ])].sort();
  return {
    schema: BLOCKER_SCHEMA,
    epochId: currentEpoch.id,
    family,
    provenance: {
      producerCommand: "bounded complete-public cubic probe",
      artifactDigest,
      recordedAt: RECORDED_AT,
    },
    observed: {
      completedPublicCalls: 0,
      representativePairsCompleted: 0,
      heldOutPairsCompleted: 0,
      fixtureTimingsUsed: false,
      promotionEligible: false,
    },
    missingAuthorities: [
      "complete public resource accounting",
      "eleven held-out public timing pairs",
      "eleven representative public timing pairs",
      "reviewed batch full-factor capability",
    ],
    proposedIntervention: {
      mechanism: FAMILY_BLOCKER_MECHANISMS[family],
      capabilityStatus: cubic ? "unavailable" : "available",
      disposition: cubic ? "reject" : "investigate",
      failedGates,
    },
    retainedRoute: {
      mechanism: cubic
        ? "Use the declared per-prime full-factorization boundary inside the complete public route"
        : "Preserve the current guarded public route until all promotion authorities exist",
      boundaryId: BOUNDARIES[family][0],
      capabilityId: authority.capability.id,
      declarationId: authority.declaration.id,
      libraryArtifactId: LIBRARY_ARTIFACT_ID,
      disposition: "investigate",
      missingAuthorities: [
        "complete public paired measurements",
        cubic ? "transactional factor reconstruction and fallback" :
          "transactional candidate construction and fallback",
      ],
    },
  };
}

const FAMILY_BLOCKER_MECHANISMS = Object.freeze({
  "cubic-factorization":
    "Batch complete cubic factor records across moduli through a reviewed mature FLINT capability",
  "dense-integral":
    "Split at characteristic holes and run FLINT nmod_poly_integral on every legal block",
  "hyperelliptic-normalization":
    "Map the genus-one normalization to an elliptic cubic and use the mature smalljac point-count capability",
});

function descriptor(filename, label = null) {
  const bytes = fs.readFileSync(filename);
  return {
    ...(label ? { label } : {}),
    path: filename,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function writeJson(directory, name, value, label = null) {
  const filename = path.join(directory, name);
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
  return descriptor(filename, label);
}

function familyInput(directory, currentEpoch, family, options = {}) {
  const prefix = family.replaceAll("-", "_");
  const authority = authorityDocuments(currentEpoch, family, options.authority ?? {});
  const declarationDescriptor = writeJson(
    directory, `${prefix}.declaration.json`, authority.declaration, "declaration-authority",
  );
  const capabilityDescriptor = writeJson(
    directory, `${prefix}.capability.json`, authority.capability, "capability-authority",
  );
  const rawReceipt = writeJson(directory, `${prefix}.raw.json`, {
    family,
    authority: options.kind === "blocker" ? "bounded-blocker" : "real-measurement",
    nonce: options.receiptNonce ?? "original",
  }, options.kind === "blocker" ? "blocker-authority" : "measurement-receipt");
  const negativeAttachments = options.kind === "blocker" ? [] : [
    ...ALTERNATIVE_CATEGORIES.map((category) => writeJson(
      directory,
      `${prefix}.alternative_${category}.json`,
      { family, category, disposition: "reviewed-negative" },
      `alternative-${category}`,
    )),
    writeJson(
      directory,
      `${prefix}.native_alternative.json`,
      { family, category: "handwritten-native", disposition: "reviewed-negative" },
      "native-alternative",
    ),
  ];
  const alternativeEvidenceDigests = Object.fromEntries(negativeAttachments
    .filter((item) => item.label.startsWith("alternative-"))
    .map((item) => [item.label.slice("alternative-".length), item.sha256]));
  const nativeAlternative = negativeAttachments.find((item) =>
    item.label === "native-alternative");
  const evidence = options.kind === "blocker"
    ? blocker(currentEpoch, family, authority, rawReceipt.sha256, options)
    : bundle(currentEpoch, family, authority, rawReceipt.sha256, {
      ...options,
      alternativeEvidenceDigests,
      nativeAlternativeEvidenceDigest: nativeAlternative.sha256,
    });
  const evidenceDescriptor = writeJson(directory, `${prefix}.evidence.json`, evidence);
  return {
    family,
    kind: options.kind === "blocker" ? "blocker" : "complete-bundle",
    evidence: evidenceDescriptor,
    attachments: [
      capabilityDescriptor, declarationDescriptor, rawReceipt, ...negativeAttachments,
    ],
  };
}

function authoritativeInput(directory, currentEpoch, options = {}) {
  const allBlockers = options.allBlockers === true;
  const families = [
    familyInput(directory, currentEpoch, "dense-integral", {
      ...(allBlockers ? { kind: "blocker", additionalFailedGates: [
        "fallback-or-rollback", "platform-fallback", "semantic-obligations",
      ] } : { baseline: 2000, candidate: 200 }),
      timingAuthority: options.timingAuthority ?? "real",
    }),
    familyInput(directory, currentEpoch, "cubic-factorization", { kind: "blocker" }),
    familyInput(directory, currentEpoch, "hyperelliptic-normalization", {
      ...(allBlockers ? { kind: "blocker" } : { interruption: "missing" }),
    }),
  ];
  return {
    schema: AUTHORITATIVE_INPUT_SCHEMA,
    mode: options.mode ?? "real",
    families: options.reverse ? families.reverse().map((entry) => ({
      ...entry, attachments: [...entry.attachments].reverse(),
    })) : families,
  };
}

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-campaign2-evidence-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function rewriteEvidence(entry, mutate) {
  const value = JSON.parse(fs.readFileSync(entry.evidence.path, "utf8"));
  mutate(value);
  fs.writeFileSync(entry.evidence.path, `${JSON.stringify(value, null, 2)}\n`);
  entry.evidence = descriptor(entry.evidence.path);
}

function rewriteAttachment(entry, label, mutate) {
  const index = entry.attachments.findIndex((item) => item.label === label);
  const attachment = entry.attachments[index];
  const value = JSON.parse(fs.readFileSync(attachment.path, "utf8"));
  mutate(value);
  fs.writeFileSync(attachment.path, `${JSON.stringify(value, null, 2)}\n`);
  entry.attachments[index] = descriptor(attachment.path, label);
  return entry.attachments[index];
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
  assert.equal(heldOutIntegral.corpus.id, "dense-integral-gf257-thirty-eight-holes");
  const definition = heldOutIntegral.corpus.definition;
  const holeCount = Array.from({ length: definition.degree + 1 }, (_, index) => index)
    .filter((index) => (index + 1) % definition.modulus === 0).length;
  assert.equal(holeCount, 38);
});

test("workload identities bind the exact current source closure and oracle definitions", () => {
  const first = campaign2Workloads(root);
  assert.deepEqual(campaign2Workloads(root), first);
  for (const [key, entry] of workloadIndex(root)) {
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

test("bundle validation is exact for pairs, digests, counters, native evidence, and platforms", () => {
  const currentEpoch = epoch();
  const grouped = entriesByFamily();
  const authority = authorityDocuments(currentEpoch, "dense-integral");
  const valid = bundle(currentEpoch, "dense-integral", authority, digest("raw"));
  assert.equal(validateBundle(valid, currentEpoch, grouped.get("dense-integral"))
    .boundary.roles.length, 2);

  const extraPairField = structuredClone(valid);
  extraPairField.boundary.roles[0].pairs[0].quartet = [1, 2, 3, 4];
  assert.throws(() => validateBundle(extraPairField, currentEpoch,
    grouped.get("dense-integral")), /fields must be exactly/);

  const fakeDigest = structuredClone(valid);
  fakeDigest.boundary.roles[0].pairs[0].candidateOutputDigest = "not-a-digest";
  assert.throws(() => validateBundle(fakeDigest, currentEpoch,
    grouped.get("dense-integral")), /digest/);

  const shortCounter = structuredClone(valid);
  shortCounter.boundary.roles[0].candidate.crossings.pop();
  assert.throws(() => validateBundle(shortCounter, currentEpoch,
    grouped.get("dense-integral")), /exactly 11/);

  const unknownPlatform = structuredClone(valid);
  unknownPlatform.platform.fallbackPlatforms.push("linux-x64-native-disabled");
  assert.throws(() => validateBundle(unknownPlatform, currentEpoch,
    grouped.get("dense-integral")), /unknown coverage value/);

  const duplicatePlatform = structuredClone(valid);
  duplicatePlatform.platform.fallbackPlatforms.push("windows-x64");
  assert.throws(() => validateBundle(duplicatePlatform, currentEpoch,
    grouped.get("dense-integral")), /must be unique/);
});

test("authoritative adjudication emits the exact select/reject/investigate v2 chain", (t) => {
  const currentEpoch = epoch();
  const directory = temporary(t);
  const input = authoritativeInput(directory, currentEpoch);
  const result = adjudicateCampaign2({ root, epoch: currentEpoch, input });
  assert.equal(result.schema, ADJUDICATION_SCHEMA);
  assert.equal(result.adjudication.status, "select");
  assert.deepEqual(
    Object.fromEntries(result.familyDispositions.map((item) => [item.family, item.disposition])),
    {
      "cubic-factorization": "reject",
      "dense-integral": "select",
      "hyperelliptic-normalization": "investigate",
    },
  );
  const cubic = result.familyDispositions.find((item) =>
    item.family === "cubic-factorization");
  assert.deepEqual(cubic.failedGates, BLOCKER_FAILED_GATES);
  assert.equal(cubic.fixtureTimingsUsed, false);
  assert.match(cubic.retainedInvestigation, /per-prime/);
  assert.match(result.decisionObservationId, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.dossierId, /^sha256:[0-9a-f]{64}$/);
  assert.equal(Object.keys(result.opportunityIds).length, 3);
  const schemas = new Set(result.documents.map((document) => document.schema));
  for (const schema of [
    contracts.SCHEMAS.observation,
    contracts.SCHEMAS.intervention,
    contracts.SCHEMAS.opportunity,
    contracts.SCHEMAS.dossier,
  ]) assert.ok(schemas.has(schema), schema);
  const blockerObservation = result.documents.find((document) =>
    document.schema === contracts.SCHEMAS.observation &&
    document.details?.kind === "typed-blocker");
  assert.deepEqual(blockerObservation.measurement.samples, [0]);
  assert.equal(blockerObservation.channel, "output-semantics");
  assert.equal(blockerObservation.measurement.unit, "count");
  assert.equal(blockerObservation.details.evidence.observed.fixtureTimingsUsed, false);
});

test("canonical result is independent of input and attachment ordering and round-trips", (t) => {
  const currentEpoch = epoch();
  const first = adjudicateCampaign2({
    root,
    epoch: currentEpoch,
    input: authoritativeInput(temporary(t), currentEpoch),
  });
  const second = adjudicateCampaign2({
    root,
    epoch: currentEpoch,
    input: authoritativeInput(temporary(t), currentEpoch, { reverse: true }),
  });
  assert.equal(second.decisionObservationId, first.decisionObservationId);
  assert.equal(second.canonical.logicalId, first.canonical.logicalId);
  assert.deepEqual(second.documents, first.documents);
  const stream = canonicalRecordStream(first.documents);
  const parsed = parseCanonicalRecordStream(stream.bytes);
  assert.equal(parsed.logicalId, first.canonical.logicalId);
  assert.equal(sha256(parsed.bytes), first.canonical.ndjsonSha256);
});

test("real mode rejects fixture timings and physical attachment mutations", (t) => {
  const currentEpoch = epoch();
  const fixtureInput = authoritativeInput(temporary(t), currentEpoch, {
    timingAuthority: "fixture",
  });
  assert.throws(() => adjudicateCampaign2({
    root, epoch: currentEpoch, input: fixtureInput,
  }), /real adjudication rejects fixture timings/);
  fixtureInput.mode = "fixture";
  assert.equal(adjudicateCampaign2({
    root, epoch: currentEpoch, input: fixtureInput,
  }).mode, "fixture");

  const physicalInput = authoritativeInput(temporary(t), currentEpoch);
  const dense = physicalInput.families.find((entry) => entry.family === "dense-integral");
  const receipt = dense.attachments.find((item) => item.label === "measurement-receipt");
  fs.appendFileSync(receipt.path, "counterfeit byte");
  assert.throws(() => validateAuthoritativeInput(physicalInput, {
    root, epoch: currentEpoch,
  }), /physical bytes differ/);
});

test("capability and declaration claims must join content-addressed current authority", (t) => {
  const currentEpoch = epoch();
  const input = authoritativeInput(temporary(t), currentEpoch);
  const dense = input.families.find((entry) => entry.family === "dense-integral");
  rewriteEvidence(dense, (value) => {
    value.matureCapability.capabilityId = id("manufactured-capability");
  });
  assert.throws(() => adjudicateCampaign2({ root, epoch: currentEpoch, input }),
    /do not join current validated authority/);

  const staleInput = authoritativeInput(temporary(t), currentEpoch);
  const staleDense = staleInput.families.find((entry) => entry.family === "dense-integral");
  const staleEpochId = id("stale-campaign2-epoch");
  const declarationAttachment = rewriteAttachment(
    staleDense, "declaration-authority", (value) => {
      const { id: ignored, schema, ...payload } = value;
      payload.epochId = staleEpochId;
      Object.assign(value, logicalDocument(schema, payload));
    },
  );
  const declaration = JSON.parse(fs.readFileSync(declarationAttachment.path, "utf8"));
  const capabilityAttachment = rewriteAttachment(
    staleDense, "capability-authority", (value) => {
      const { id: ignored, schema, ...payload } = value;
      payload.epochId = staleEpochId;
      payload.declarationId = declaration.id;
      Object.assign(value, logicalDocument(schema, payload));
    },
  );
  const capability = JSON.parse(fs.readFileSync(capabilityAttachment.path, "utf8"));
  rewriteEvidence(staleDense, (value) => {
    value.matureCapability.capabilityId = capability.id;
    value.matureCapability.declarationId = declaration.id;
  });
  assert.throws(() => adjudicateCampaign2({
    root, epoch: currentEpoch, input: staleInput,
  }), /does not bind the current family and epoch/);
});

test("typed blocker has zero samples, explicit missing authority, and cannot reject per-prime", (t) => {
  const currentEpoch = epoch();
  const grouped = entriesByFamily();
  const input = authoritativeInput(temporary(t), currentEpoch);
  const cubic = input.families.find((entry) => entry.family === "cubic-factorization");
  const raw = JSON.parse(fs.readFileSync(cubic.evidence.path, "utf8"));
  assert.equal(validateBlocker(raw, currentEpoch).observed.completedPublicCalls, 0);

  raw.observed.representativePairsCompleted = 1;
  assert.throws(() => validateBlocker(raw, currentEpoch), /must be zero/);
  raw.observed.representativePairsCompleted = 0;
  raw.retainedRoute.disposition = "reject";
  assert.throws(() => validateBlocker(raw, currentEpoch), /preserve the per-prime/);

  const completeCubicAuthority = authorityDocuments(currentEpoch, "cubic-factorization");
  const completeCubic = bundle(
    currentEpoch,
    "cubic-factorization",
    completeCubicAuthority,
    digest("cubic-fixture-artifact"),
    { timingAuthority: "fixture" },
  );
  assert.equal(validateBundle(completeCubic, currentEpoch,
    grouped.get("cubic-factorization")).provenance.timingAuthority, "fixture");
});

test("all-blocker current evidence yields investigate without fabricating a dossier", (t) => {
  const currentEpoch = epoch();
  const baselineInput = authoritativeInput(temporary(t), currentEpoch, {
    allBlockers: true,
  });
  const baseline = adjudicateCampaign2({ root, epoch: currentEpoch, input: baselineInput });
  assert.equal(baseline.adjudication.status, "investigate");
  assert.equal(baseline.adjudication.selectedInterventionId, null);
  assert.equal(baseline.adjudication.hardGates.length, 3);
  assert.ok(baseline.adjudication.hardGates.every((entry) =>
    entry.gates.length >= BLOCKER_FAILED_GATES.length &&
    entry.gates.every((gate) => gate.status === "fail")));
  assert.equal(baseline.dossierId, null);
  assert.equal(baseline.documents.some((document) =>
    document.schema === contracts.SCHEMAS.dossier), false);
  assert.deepEqual(
    Object.fromEntries(baseline.familyDispositions.map((item) =>
      [item.family, item.disposition])),
    {
      "cubic-factorization": "reject",
      "dense-integral": "investigate",
      "hyperelliptic-normalization": "investigate",
    },
  );
  const blockerObservations = baseline.documents.filter((document) =>
    document.schema === contracts.SCHEMAS.observation &&
    document.details?.kind === "typed-blocker");
  assert.equal(blockerObservations.length, 3);
  assert.ok(blockerObservations.every((observation) =>
    observation.channel === "output-semantics" &&
    observation.measurement.unit === "count" &&
    observation.measurement.samples.length === 1 &&
    observation.measurement.samples[0] === 0));

  const changedInput = authoritativeInput(temporary(t), currentEpoch, {
    allBlockers: true,
  });
  const dense = changedInput.families.find((entry) => entry.family === "dense-integral");
  const changedAuthority = rewriteAttachment(dense, "blocker-authority", (value) => {
    value.nonce = "new-current-feasibility-receipt";
  });
  rewriteEvidence(dense, (value) => {
    value.provenance.artifactDigest = changedAuthority.sha256;
  });
  const changed = adjudicateCampaign2({ root, epoch: currentEpoch, input: changedInput });
  assert.notEqual(changed.decisionObservationId, baseline.decisionObservationId);
  assert.notEqual(changed.canonical.logicalId, baseline.canonical.logicalId);

  const invalidInput = authoritativeInput(temporary(t), currentEpoch, {
    allBlockers: true,
  });
  const invalidDense = invalidInput.families.find((entry) =>
    entry.family === "dense-integral");
  rewriteEvidence(invalidDense, (value) => {
    value.proposedIntervention.disposition = "reject";
  });
  assert.throws(() => adjudicateCampaign2({
    root, epoch: currentEpoch, input: invalidInput,
  }), /non-cubic proposal must remain investigate/);
});

test("every complete evidence dimension changes global content identities", (t) => {
  const currentEpoch = epoch();
  const baseline = adjudicateCampaign2({
    root,
    epoch: currentEpoch,
    input: authoritativeInput(temporary(t), currentEpoch),
  });
  const mutations = [
    ["timing", (value) => { value.boundary.roles[0].pairs[0].candidateMicroseconds += 1; }],
    ["output", (value) => {
      const changed = digest("changed-exact-output");
      value.boundary.roles[0].pairs[0].baselineOutputDigest = changed;
      value.boundary.roles[0].pairs[0].candidateOutputDigest = changed;
    }],
    ["counter", (value) => { value.boundary.roles[0].candidate.copiedBytes[0] += 1; }],
    ["provenance", (value) => { value.provenance.recordedAt = "2026-08-29T12:00:01.000Z"; }],
    ["platform", (value) => {
      value.platform.nativePlatforms = ["linux-x64", "macos-arm64"];
      value.platform.fallbackPlatforms = ["linux-arm64", "windows-x64"];
    }],
  ];
  for (const [name, mutate] of mutations) {
    const input = authoritativeInput(temporary(t), currentEpoch);
    const dense = input.families.find((entry) => entry.family === "dense-integral");
    rewriteEvidence(dense, mutate);
    const changed = adjudicateCampaign2({ root, epoch: currentEpoch, input });
    assert.notEqual(changed.decisionObservationId, baseline.decisionObservationId, name);
    assert.notEqual(changed.canonical.logicalId, baseline.canonical.logicalId, name);
    assert.notEqual(
      changed.familyDispositions.find((item) => item.family === "dense-integral")
        .interventionId,
      baseline.familyDispositions.find((item) => item.family === "dense-integral")
        .interventionId,
      name,
    );
  }

  const input = authoritativeInput(temporary(t), currentEpoch);
  const dense = input.families.find((entry) => entry.family === "dense-integral");
  const changedReceipt = rewriteAttachment(dense, "measurement-receipt", (value) => {
    value.nonce = "changed-physical-receipt";
  });
  rewriteEvidence(dense, (value) => {
    value.provenance.artifactDigest = changedReceipt.sha256;
  });
  const changed = adjudicateCampaign2({ root, epoch: currentEpoch, input });
  assert.notEqual(changed.decisionObservationId, baseline.decisionObservationId);
  assert.notEqual(changed.canonical.logicalId, baseline.canonical.logicalId);
});

test("incomplete workload epochs fail before authoritative adjudication", (t) => {
  const incomplete = epoch(campaign2Workloads(root).slice(0, 5));
  const input = authoritativeInput(temporary(t), incomplete);
  assert.throws(() => adjudicateCampaign2({
    root, epoch: incomplete, input,
  }), /does not bind 1 reviewed Campaign 2 workloads/);
});

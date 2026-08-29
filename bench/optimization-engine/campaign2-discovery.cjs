#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentId,
  contentIdentity,
  digest,
  exactKeys,
  sha256,
} = require("../../tools/optimizer-development/common.cjs");
const {
  BROWSERS,
  INTERVENTION_CATEGORIES,
  PLATFORMS,
  createDocument,
  validateEpoch,
  validateSubject,
} = require("../../tools/optimization-engine/contracts.cjs");
const {
  HARD_GATE_CODES,
  adjudicateCandidates,
  auditIntervention,
} = require("../../tools/optimization-engine/auditors.cjs");
const { createDossier } = require("../../tools/optimization-engine/planner.cjs");
const {
  canonicalRecordStream,
  parseCanonicalRecordStream,
} = require("../../tools/optimization-engine/evidence-store.cjs");
const {
  campaign2Workloads,
  workloadIndex,
} = require("./campaign2-workloads.cjs");

const DISCOVERY_SCHEMA = "sagejs.optimization-campaign2-discovery-evidence/v1";
const AUTHORITATIVE_INPUT_SCHEMA =
  "sagejs.optimization-campaign2-authoritative-input/v2";
const BLOCKER_SCHEMA = "sagejs.optimization-campaign2-family-blocker/v2";
const CAPABILITY_AUTHORITY_SCHEMA =
  "sagejs.optimization-campaign2-capability-authority/v1";
const DECLARATION_AUTHORITY_SCHEMA =
  "sagejs.optimization-campaign2-declaration-authority/v1";
const ATTACHMENT_SET_SCHEMA = "sagejs.optimization-campaign2-attachment-set/v1";
const ADJUDICATION_SCHEMA = "sagejs.optimization-campaign2-adjudication/v2";
const EXPECTED_FAMILIES = Object.freeze([
  "cubic-factorization",
  "dense-integral",
  "hyperelliptic-normalization",
]);
const ALTERNATIVE_CATEGORIES = Object.freeze(
  INTERVENTION_CATEGORIES.filter((category) => category !== "library-route"),
);
const COUNTER_FIELDS = Object.freeze([
  "conversionMicroseconds", "crossings", "copiedBytes", "allocations",
  "resultConstructions", "liveBefore", "liveAfter", "highWater",
]);
const BLOCKER_FAILED_GATES = Object.freeze([
  "complete-cost-boundary",
  "mature-capability-audit",
  "positive-eleven-pair-separation",
  "worst-pair-ten-percent",
]);
const AUTHORITY_LABELS = Object.freeze([
  "capability-authority",
  "declaration-authority",
]);

const FAMILY_MECHANISMS = Object.freeze({
  "dense-integral": Object.freeze({
    mechanism: "Split at characteristic holes and run FLINT nmod_poly_integral on every legal block",
    changedComponents: ["public polynomial integral route"],
    removes: ["per-coefficient dynamic field division"],
    adds: ["characteristic-hole preflight", "FLINT block calls", "block placement"],
  }),
  "cubic-factorization": Object.freeze({
    mechanism: "Batch complete cubic factor records across moduli through a reviewed mature FLINT capability",
    changedComponents: ["cubic class-number factor production route"],
    removes: ["per-prime specialized Python factorization"],
    adds: ["batched foreign conversion", "full-factor validation", "record staging"],
  }),
  "hyperelliptic-normalization": Object.freeze({
    mechanism: "Map the genus-one normalization to an elliptic cubic and use the mature smalljac point-count capability",
    changedComponents: ["semistable hyperelliptic normalization route"],
    removes: ["generic normalization point enumeration"],
    adds: ["exact elliptic transformation", "smalljac call", "Euler-factor reconstruction"],
  }),
});

function fail(label, message) {
  throw new Error(`Campaign 2 discovery ${label}: ${message}`);
}

function uniqueSorted(values, label) {
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) fail(label, "must be unique");
  return sorted;
}

function checkedBoolean(label, value) {
  if (typeof value !== "boolean") fail(label, "must be boolean");
  return value;
}

function checkedString(label, value) {
  if (typeof value !== "string" || value.length === 0) fail(label, "must be nonempty");
  return value;
}

function checkedNumber(label, value, { positive = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      (positive ? value <= 0 : value < 0)) {
    fail(label, positive ? "must be a positive finite number" :
      "must be a nonnegative finite number");
  }
  return value;
}

function checkedInteger(label, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(label, "must be a nonnegative safe integer");
  }
  return value;
}

function checkedTimestamp(label, value) {
  checkedString(label, value);
  if (new Date(value).toISOString() !== value) fail(label, "must be a canonical ISO timestamp");
  return value;
}

function checkedArray(label, value, length, validator) {
  if (!Array.isArray(value) || value.length !== length) {
    fail(label, `must contain exactly ${length} entries`);
  }
  return value.map((item, index) => validator(`${label}[${index}]`, item));
}

function validateCounters(label, value) {
  exactKeys(label, value, COUNTER_FIELDS);
  const result = {};
  for (const field of COUNTER_FIELDS) {
    const validator = field === "conversionMicroseconds" ? checkedNumber : checkedInteger;
    result[field] = checkedArray(`${label}.${field}`, value[field], 11, validator);
  }
  return result;
}

function validatePair(label, value, index) {
  exactKeys(label, value, [
    "order", "baselineMicroseconds", "candidateMicroseconds",
    "baselineOutputDigest", "candidateOutputDigest",
  ]);
  const expectedOrder = index % 2 === 0 ? "ABBA" : "BAAB";
  if (value.order !== expectedOrder) fail(`${label}.order`, `must be ${expectedOrder}`);
  const baselineOutputDigest = digest(
    `${label}.baselineOutputDigest`, value.baselineOutputDigest,
  );
  const candidateOutputDigest = digest(
    `${label}.candidateOutputDigest`, value.candidateOutputDigest,
  );
  if (baselineOutputDigest !== candidateOutputDigest) {
    fail(label, "baseline and candidate output digests differ");
  }
  return {
    order: value.order,
    baselineMicroseconds: checkedNumber(
      `${label}.baselineMicroseconds`, value.baselineMicroseconds, { positive: true },
    ),
    candidateMicroseconds: checkedNumber(
      `${label}.candidateMicroseconds`, value.candidateMicroseconds,
    ),
    baselineOutputDigest,
    candidateOutputDigest,
  };
}

function validateBoundaryRole(label, value, expectedWorkload) {
  exactKeys(label, value, [
    "role", "workloadId", "pairs", "baseline", "candidate", "cleanupComplete",
  ]);
  if (value.role !== expectedWorkload.role) {
    fail(`${label}.role`, `must be ${expectedWorkload.role}`);
  }
  if (value.workloadId !== expectedWorkload.id) {
    fail(`${label}.workloadId`, "does not identify the current reviewed workload");
  }
  if (!Array.isArray(value.pairs) || value.pairs.length !== 11) {
    fail(`${label}.pairs`, "must contain exactly 11 alternating paired observations");
  }
  const pairs = value.pairs.map((pair, index) =>
    validatePair(`${label}.pairs[${index}]`, pair, index));
  return {
    role: value.role,
    workloadId: value.workloadId,
    pairs,
    baseline: validateCounters(`${label}.baseline`, value.baseline),
    candidate: validateCounters(`${label}.candidate`, value.candidate),
    cleanupComplete: checkedBoolean(`${label}.cleanupComplete`, value.cleanupComplete),
  };
}

function validateAlternatives(value) {
  if (!Array.isArray(value) || value.length !== ALTERNATIVE_CATEGORIES.length) {
    fail("alternatives", "must retain one disposition for every non-library category");
  }
  const allowed = new Set([
    "inferior", "unavailable", "duplicate", "not-causal", "investigate",
  ]);
  const checked = value.map((item, index) => {
    const label = `alternatives[${index}]`;
    exactKeys(label, item, ["category", "mechanism", "disposition", "evidenceDigest"]);
    if (!ALTERNATIVE_CATEGORIES.includes(item.category)) {
      fail(`${label}.category`, `unknown alternative category ${item.category}`);
    }
    checkedString(`${label}.mechanism`, item.mechanism);
    if (!allowed.has(item.disposition)) {
      fail(`${label}.disposition`, `unknown disposition ${item.disposition}`);
    }
    digest(`${label}.evidenceDigest`, item.evidenceDigest);
    return { ...item };
  });
  const categories = checked.map((item) => item.category);
  if (canonicalJson(categories) !== canonicalJson([...categories].sort()) ||
      new Set(categories).size !== ALTERNATIVE_CATEGORIES.length) {
    fail("alternatives", "must use deterministic unique category order");
  }
  const compiler = checked.find((item) => item.category === "compiler");
  if (!compiler.mechanism.includes("V8") || !compiler.mechanism.includes("Wasm")) {
    fail("alternatives.compiler", "must retain both V8 and Wasm evidence");
  }
  return checked;
}

function validateCoverage(label, values, allowed) {
  if (!Array.isArray(values)) fail(label, "must be an array");
  for (const [index, value] of values.entries()) {
    if (!allowed.includes(value)) fail(`${label}[${index}]`, `unknown coverage value ${value}`);
  }
  const sorted = uniqueSorted(values, label);
  if (canonicalJson(sorted) !== canonicalJson(values)) fail(label, "must be sorted");
  return sorted;
}

function validatePlatform(label, raw, familyEntries) {
  exactKeys(label, raw, [
    "nativePlatforms", "fallbackPlatforms", "fallbackBrowsers",
    "correctFallback", "capabilityGuardBeforeEffects",
  ]);
  const nativePlatforms = validateCoverage(
    `${label}.nativePlatforms`, raw.nativePlatforms, PLATFORMS,
  );
  const fallbackPlatforms = validateCoverage(
    `${label}.fallbackPlatforms`, raw.fallbackPlatforms, PLATFORMS,
  );
  const fallbackBrowsers = validateCoverage(
    `${label}.fallbackBrowsers`, raw.fallbackBrowsers, BROWSERS,
  );
  const overlap = nativePlatforms.filter((item) => fallbackPlatforms.includes(item));
  if (overlap.length > 0) fail(label, `native/fallback platform overlap: ${overlap.join(", ")}`);
  const expectedPlatforms = [...new Set(
    familyEntries.flatMap((entry) => entry.workload.platforms),
  )].sort();
  const expectedBrowsers = [...new Set(
    familyEntries.flatMap((entry) => entry.workload.browsers),
  )].sort();
  if (canonicalJson([...nativePlatforms, ...fallbackPlatforms].sort()) !==
      canonicalJson(expectedPlatforms)) {
    fail(label, "must cover exactly the reviewed platforms");
  }
  if (canonicalJson(fallbackBrowsers) !== canonicalJson(expectedBrowsers)) {
    fail(label, "must cover exactly the reviewed browsers");
  }
  return {
    nativePlatforms,
    fallbackPlatforms,
    fallbackBrowsers,
    correctFallback: checkedBoolean(`${label}.correctFallback`, raw.correctFallback),
    capabilityGuardBeforeEffects: checkedBoolean(
      `${label}.capabilityGuardBeforeEffects`, raw.capabilityGuardBeforeEffects,
    ),
  };
}

function validateBundle(raw, epoch, familyEntries) {
  const label = `evidence ${raw?.family || "unknown"}`;
  exactKeys(label, raw, [
    "schema", "epochId", "family", "provenance", "matureCapability", "semantics",
    "platform", "boundary", "alternatives", "nativeAlternative",
  ]);
  if (raw.schema !== DISCOVERY_SCHEMA) fail(`${label}.schema`, `unknown schema ${raw.schema}`);
  if (raw.epochId !== epoch.id) fail(`${label}.epochId`, "must equal the discovery epoch");
  if (!FAMILY_MECHANISMS[raw.family]) fail(`${label}.family`, `unknown family ${raw.family}`);
  exactKeys(`${label}.provenance`, raw.provenance, [
    "producerCommand", "artifactDigest", "recordedAt", "timingAuthority",
  ]);
  const provenance = {
    producerCommand: checkedString(
      `${label}.provenance.producerCommand`, raw.provenance.producerCommand,
    ),
    artifactDigest: digest(
      `${label}.provenance.artifactDigest`, raw.provenance.artifactDigest,
    ),
    recordedAt: checkedTimestamp(
      `${label}.provenance.recordedAt`, raw.provenance.recordedAt,
    ),
    timingAuthority: raw.provenance.timingAuthority,
  };
  if (!new Set(["real", "fixture"]).has(provenance.timingAuthority)) {
    fail(`${label}.provenance.timingAuthority`, "must be real or fixture");
  }
  exactKeys(`${label}.matureCapability`, raw.matureCapability, [
    "status", "capabilityId", "libraryArtifactId", "declarationId",
    "capabilityAuditComplete", "batchingComplete", "residencyComplete", "interruption",
  ]);
  if (!new Set(["available", "unavailable", "incomplete"]).has(raw.matureCapability.status)) {
    fail(`${label}.matureCapability.status`, "must be available, unavailable, or incomplete");
  }
  for (const field of ["capabilityId", "libraryArtifactId", "declarationId"]) {
    contentId(`${label}.matureCapability.${field}`, raw.matureCapability[field]);
  }
  for (const field of ["capabilityAuditComplete", "batchingComplete", "residencyComplete"]) {
    checkedBoolean(`${label}.matureCapability.${field}`, raw.matureCapability[field]);
  }
  exactKeys(`${label}.matureCapability.interruption`, raw.matureCapability.interruption, [
    "status", "policy", "boundedCall", "workerIsolation",
  ]);
  if (!new Set(["complete", "missing"]).has(raw.matureCapability.interruption.status)) {
    fail(`${label}.matureCapability.interruption.status`, "must be complete or missing");
  }
  checkedString(
    `${label}.matureCapability.interruption.policy`,
    raw.matureCapability.interruption.policy,
  );
  checkedBoolean(
    `${label}.matureCapability.interruption.boundedCall`,
    raw.matureCapability.interruption.boundedCall,
  );
  checkedBoolean(
    `${label}.matureCapability.interruption.workerIsolation`,
    raw.matureCapability.interruption.workerIsolation,
  );
  exactKeys(`${label}.semantics`, raw.semantics, [
    "outputEquivalent", "exceptionEquivalent", "proofModeEquivalent",
    "transformationVerified", "noPartialPublication", "guardedFallback",
    "failureCasesVerified",
  ]);
  const semantics = {};
  for (const [field, value] of Object.entries(raw.semantics)) {
    semantics[field] = checkedBoolean(`${label}.semantics.${field}`, value);
  }
  const platform = validatePlatform(`${label}.platform`, raw.platform, familyEntries);
  exactKeys(`${label}.boundary`, raw.boundary, ["complete", "included", "excluded", "roles"]);
  checkedBoolean(`${label}.boundary.complete`, raw.boundary.complete);
  const expectedIncluded = familyEntries[0].specification.costBoundary.included;
  const expectedExcluded = familyEntries[0].specification.costBoundary.excluded;
  if (canonicalJson(raw.boundary.included) !== canonicalJson(expectedIncluded) ||
      canonicalJson(raw.boundary.excluded) !== canonicalJson(expectedExcluded)) {
    fail(`${label}.boundary`, "does not cover the reviewed inclusive cost boundary");
  }
  if (!Array.isArray(raw.boundary.roles) || raw.boundary.roles.length !== 2) {
    fail(`${label}.boundary.roles`, "must cover representative and held-out workloads");
  }
  const byRole = new Map(familyEntries.map((entry) => [entry.workload.role, entry.workload]));
  const roles = raw.boundary.roles.map((role, index) => {
    const expected = byRole.get(role.role);
    if (!expected) fail(`${label}.boundary.roles[${index}]`, `unknown role ${role.role}`);
    return validateBoundaryRole(`${label}.boundary.roles[${index}]`, role, expected);
  }).sort((left, right) => `${left.role}:${left.workloadId}`.localeCompare(
    `${right.role}:${right.workloadId}`,
  ));
  if (new Set(roles.map((role) => role.role)).size !== 2) {
    fail(`${label}.boundary.roles`, "must have distinct representative and held-out roles");
  }
  const alternatives = validateAlternatives(raw.alternatives);
  exactKeys(`${label}.nativeAlternative`, raw.nativeAlternative, [
    "mechanism", "disposition", "evidenceDigest",
  ]);
  if (!checkedString(`${label}.nativeAlternative.mechanism`,
    raw.nativeAlternative.mechanism).includes("native")) {
    fail(`${label}.nativeAlternative.mechanism`, "must retain handwritten native evidence");
  }
  if (!new Set([
    "inferior", "unavailable", "duplicate", "duplicate-mature-capability",
    "not-causal", "investigate",
  ]).has(raw.nativeAlternative.disposition)) {
    fail(`${label}.nativeAlternative.disposition`, "has an unknown disposition");
  }
  digest(`${label}.nativeAlternative.evidenceDigest`, raw.nativeAlternative.evidenceDigest);
  return {
    ...raw,
    provenance,
    semantics,
    platform,
    boundary: { ...raw.boundary, roles },
    alternatives,
    nativeAlternative: { ...raw.nativeAlternative },
  };
}

function validateBlocker(raw, epoch) {
  const label = `blocker ${raw?.family || "unknown"}`;
  exactKeys(label, raw, [
    "schema", "epochId", "family", "provenance", "observed", "missingAuthorities",
    "proposedIntervention", "retainedRoute",
  ]);
  if (raw.schema !== BLOCKER_SCHEMA) fail(`${label}.schema`, `unknown schema ${raw.schema}`);
  if (raw.epochId !== epoch.id) fail(`${label}.epochId`, "must equal the discovery epoch");
  if (!EXPECTED_FAMILIES.includes(raw.family)) fail(`${label}.family`, "is unknown");
  exactKeys(`${label}.provenance`, raw.provenance, [
    "producerCommand", "artifactDigest", "recordedAt",
  ]);
  const provenance = {
    producerCommand: checkedString(
      `${label}.provenance.producerCommand`, raw.provenance.producerCommand,
    ),
    artifactDigest: digest(`${label}.provenance.artifactDigest`,
      raw.provenance.artifactDigest),
    recordedAt: checkedTimestamp(`${label}.provenance.recordedAt`,
      raw.provenance.recordedAt),
  };
  exactKeys(`${label}.observed`, raw.observed, [
    "completedPublicCalls", "representativePairsCompleted", "heldOutPairsCompleted",
    "fixtureTimingsUsed", "promotionEligible",
  ]);
  for (const field of [
    "completedPublicCalls", "representativePairsCompleted", "heldOutPairsCompleted",
  ]) {
    if (checkedInteger(`${label}.observed.${field}`, raw.observed[field]) !== 0) {
      fail(`${label}.observed.${field}`, "must be zero");
    }
  }
  if (checkedBoolean(`${label}.observed.fixtureTimingsUsed`,
    raw.observed.fixtureTimingsUsed) !== false ||
      checkedBoolean(`${label}.observed.promotionEligible`,
        raw.observed.promotionEligible) !== false) {
    fail(`${label}.observed`, "fixture timings and promotion eligibility must be false");
  }
  if (!Array.isArray(raw.missingAuthorities) || raw.missingAuthorities.length === 0) {
    fail(`${label}.missingAuthorities`, "must enumerate explicit missing authorities");
  }
  const missingAuthorities = uniqueSorted(raw.missingAuthorities.map((item, index) =>
    checkedString(`${label}.missingAuthorities[${index}]`, item)),
  `${label}.missingAuthorities`);
  if (canonicalJson(missingAuthorities) !== canonicalJson(raw.missingAuthorities)) {
    fail(`${label}.missingAuthorities`, "must be sorted");
  }
  exactKeys(`${label}.proposedIntervention`, raw.proposedIntervention, [
    "mechanism", "capabilityStatus", "disposition", "failedGates",
  ]);
  checkedString(`${label}.proposedIntervention.mechanism`,
    raw.proposedIntervention.mechanism);
  if (!Array.isArray(raw.proposedIntervention.failedGates) ||
      raw.proposedIntervention.failedGates.length === 0) {
    fail(`${label}.proposedIntervention.failedGates`, "must be a nonempty array");
  }
  const failedGates = uniqueSorted(raw.proposedIntervention.failedGates.map(
    (gate, index) => checkedString(`${label}.proposedIntervention.failedGates[${index}]`, gate),
  ), `${label}.proposedIntervention.failedGates`);
  if (canonicalJson(failedGates) !== canonicalJson(raw.proposedIntervention.failedGates) ||
      failedGates.some((gate) => !HARD_GATE_CODES.includes(gate))) {
    fail(`${label}.proposedIntervention.failedGates`, "must be sorted known hard gates");
  }
  for (const gate of BLOCKER_FAILED_GATES) {
    if (!failedGates.includes(gate)) {
      fail(`${label}.proposedIntervention.failedGates`, `must include ${gate}`);
    }
  }
  if (raw.family === "cubic-factorization") {
    if (raw.proposedIntervention.capabilityStatus !== "unavailable" ||
        raw.proposedIntervention.disposition !== "reject" ||
        canonicalJson(failedGates) !== canonicalJson(BLOCKER_FAILED_GATES)) {
      fail(`${label}.proposedIntervention`,
        "must reject the unavailable complete batch proposal with exact failed gates");
    }
  } else if (!new Set(["available", "incomplete"]).has(
    raw.proposedIntervention.capabilityStatus,
  ) || raw.proposedIntervention.disposition !== "investigate") {
    fail(`${label}.proposedIntervention`,
      "an incomplete non-cubic proposal must remain investigate");
  }
  exactKeys(`${label}.retainedRoute`, raw.retainedRoute, [
    "mechanism", "boundaryId", "capabilityId", "declarationId", "libraryArtifactId",
    "disposition", "missingAuthorities",
  ]);
  checkedString(`${label}.retainedRoute.mechanism`, raw.retainedRoute.mechanism);
  if (raw.retainedRoute.disposition !== "investigate") {
    fail(`${label}.retainedRoute`, raw.family === "cubic-factorization"
      ? "must preserve the per-prime FLINT route as investigate"
      : "must preserve the current route as investigate");
  }
  if (raw.family === "cubic-factorization" &&
      raw.retainedRoute.boundaryId !== "ffi:flint:nmod_poly_factor") {
    fail(`${label}.retainedRoute`, "must preserve the per-prime FLINT route as investigate");
  }
  for (const field of ["capabilityId", "declarationId", "libraryArtifactId"]) {
    contentId(`${label}.retainedRoute.${field}`, raw.retainedRoute[field]);
  }
  if (!Array.isArray(raw.retainedRoute.missingAuthorities) ||
      raw.retainedRoute.missingAuthorities.length === 0) {
    fail(`${label}.retainedRoute.missingAuthorities`,
      "must enumerate the remaining per-prime authorities");
  }
  const retainedMissing = uniqueSorted(raw.retainedRoute.missingAuthorities.map(
    (item, index) => checkedString(`${label}.retainedRoute.missingAuthorities[${index}]`, item),
  ), `${label}.retainedRoute.missingAuthorities`);
  if (canonicalJson(retainedMissing) !== canonicalJson(raw.retainedRoute.missingAuthorities)) {
    fail(`${label}.retainedRoute.missingAuthorities`, "must be sorted");
  }
  return {
    ...raw,
    provenance,
    missingAuthorities,
    proposedIntervention: { ...raw.proposedIntervention, failedGates },
    retainedRoute: { ...raw.retainedRoute, missingAuthorities: retainedMissing },
  };
}

function logicalDocument(schema, value, label) {
  exactKeys(label, value, ["schema", "id", ...Object.keys(value).filter(
    (key) => key !== "schema" && key !== "id",
  )]);
  if (value.schema !== schema) fail(`${label}.schema`, `unknown schema ${value.schema}`);
  contentId(`${label}.id`, value.id);
  const { id, schema: ignored, ...payload } = value;
  const expected = contentIdentity(schema, payload);
  if (id !== expected) fail(`${label}.id`, `is stale; expected ${expected}`);
  return { schema, id, ...payload };
}

function validateDeclarationAuthority(raw, { root, epoch, family }) {
  const label = `${family} declaration authority`;
  exactKeys(label, raw, [
    "schema", "id", "epochId", "family", "registryPath", "registryDigest",
    "boundaryIds", "recordedAt",
  ]);
  const checked = logicalDocument(DECLARATION_AUTHORITY_SCHEMA, raw, label);
  if (checked.epochId !== epoch.id || checked.family !== family) {
    fail(label, "does not bind the current family and epoch");
  }
  if (checked.registryPath !== "architecture/native-boundaries.json") {
    fail(`${label}.registryPath`, "must use the reviewed native boundary registry");
  }
  const registryBytes = fs.readFileSync(path.join(root, checked.registryPath));
  if (digest(`${label}.registryDigest`, checked.registryDigest) !== sha256(registryBytes)) {
    fail(`${label}.registryDigest`, "does not match current registry bytes");
  }
  if (!Array.isArray(checked.boundaryIds) || checked.boundaryIds.length === 0) {
    fail(`${label}.boundaryIds`, "must be nonempty");
  }
  const boundaryIds = uniqueSorted(checked.boundaryIds.map((item, index) =>
    checkedString(`${label}.boundaryIds[${index}]`, item)), `${label}.boundaryIds`);
  if (canonicalJson(boundaryIds) !== canonicalJson(checked.boundaryIds)) {
    fail(`${label}.boundaryIds`, "must be sorted");
  }
  const registry = JSON.parse(registryBytes.toString("utf8"));
  for (const boundaryId of boundaryIds) {
    if (registry.boundaries.filter((boundary) => boundary.id === boundaryId).length !== 1) {
      fail(`${label}.boundaryIds`, `${boundaryId} is not a unique reviewed declaration`);
    }
  }
  checkedTimestamp(`${label}.recordedAt`, checked.recordedAt);
  return checked;
}

function validateCapabilityAuthority(raw, { epoch, family, declaration }) {
  const label = `${family} capability authority`;
  exactKeys(label, raw, [
    "schema", "id", "epochId", "family", "status", "boundaryId",
    "libraryArtifactId", "declarationId", "recordedAt",
  ]);
  const checked = logicalDocument(CAPABILITY_AUTHORITY_SCHEMA, raw, label);
  if (checked.epochId !== epoch.id || checked.family !== family) {
    fail(label, "does not bind the current family and epoch");
  }
  if (!new Set(["available", "unavailable", "incomplete"]).has(checked.status)) {
    fail(`${label}.status`, "must be available, unavailable, or incomplete");
  }
  if (!declaration.boundaryIds.includes(checked.boundaryId) ||
      checked.declarationId !== declaration.id) {
    fail(label, "does not join the reviewed declaration");
  }
  const artifacts = epoch.components.filter((component) =>
    component.id === checked.libraryArtifactId &&
    new Set(["native-artifact", "wasm-artifact"]).has(component.kind));
  if (artifacts.length !== 1) {
    fail(`${label}.libraryArtifactId`, "is not an exact epoch library artifact");
  }
  checkedTimestamp(`${label}.recordedAt`, checked.recordedAt);
  return checked;
}

function validatePhysicalFile(label, value, { attachment = false } = {}) {
  exactKeys(label, value, attachment
    ? ["label", "path", "bytes", "sha256"] : ["path", "bytes", "sha256"]);
  if (attachment) {
    if (typeof value.label !== "string" ||
        !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.label)) {
      fail(`${label}.label`, "must be kebab-case");
    }
  }
  if (typeof value.path !== "string" || !path.isAbsolute(value.path)) {
    fail(`${label}.path`, "must be absolute");
  }
  const expectedBytes = checkedInteger(`${label}.bytes`, value.bytes);
  const expectedDigest = digest(`${label}.sha256`, value.sha256);
  const stat = fs.lstatSync(value.path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label}.path`, "must be a regular file");
  const bytes = fs.readFileSync(value.path);
  const actualDigest = sha256(bytes);
  if (bytes.length !== expectedBytes || actualDigest !== expectedDigest) {
    fail(label, `physical bytes differ; got ${bytes.length}/${actualDigest}`);
  }
  return {
    ...(attachment ? { label: value.label } : {}),
    bytes: bytes.length,
    sha256: actualDigest,
    sourcePath: path.resolve(value.path),
    rawBytes: bytes,
  };
}

function validateAuthorityJoin(entry, { root, epoch }) {
  const byLabel = new Map(entry.attachments.map((item) => [item.label, item]));
  for (const label of AUTHORITY_LABELS) {
    if (!byLabel.has(label)) fail(entry.family, `missing physical ${label}`);
  }
  let declarationRaw;
  let capabilityRaw;
  try {
    declarationRaw = JSON.parse(byLabel.get("declaration-authority").rawBytes.toString("utf8"));
    capabilityRaw = JSON.parse(byLabel.get("capability-authority").rawBytes.toString("utf8"));
  } catch {
    fail(entry.family, "capability/declaration authority is not JSON");
  }
  const declaration = validateDeclarationAuthority(declarationRaw, {
    root, epoch, family: entry.family,
  });
  const capability = validateCapabilityAuthority(capabilityRaw, {
    epoch, family: entry.family, declaration,
  });
  return { declaration, capability };
}

function validateAuthoritativeInput(raw, { root, epoch }) {
  exactKeys("authoritative input", raw, ["schema", "mode", "families"]);
  if (raw.schema !== AUTHORITATIVE_INPUT_SCHEMA) {
    fail("authoritative input.schema", `unknown schema ${raw.schema}`);
  }
  if (!new Set(["real", "fixture"]).has(raw.mode)) {
    fail("authoritative input.mode", "must be real or fixture");
  }
  if (!Array.isArray(raw.families) || raw.families.length !== EXPECTED_FAMILIES.length) {
    fail("authoritative input.families", "must contain exactly three families");
  }
  const grouped = familyEntries(root);
  const families = raw.families.map((entry, familyIndex) => {
    const label = `authoritative input.families[${familyIndex}]`;
    if (entry?.kind === "complete-bundle") {
      exactKeys(label, entry, ["family", "kind", "evidence", "attachments"]);
    } else if (entry?.kind === "blocker") {
      exactKeys(label, entry, ["family", "kind", "evidence", "attachments"]);
    } else {
      fail(`${label}.kind`, "must be complete-bundle or blocker");
    }
    if (!EXPECTED_FAMILIES.includes(entry.family)) {
      fail(`${label}.family`, `unknown family ${entry.family}`);
    }
    const evidenceDescriptor = validatePhysicalFile(`${label}.evidence`, entry.evidence);
    let evidence;
    try {
      evidence = JSON.parse(evidenceDescriptor.rawBytes.toString("utf8"));
    } catch {
      fail(`${label}.evidence`, "must contain JSON");
    }
    if (!Array.isArray(entry.attachments) || entry.attachments.length < 3) {
      fail(`${label}.attachments`, "must retain capability, declaration, and raw authority");
    }
    const attachments = entry.attachments.map((attachment, attachmentIndex) =>
      validatePhysicalFile(`${label}.attachments[${attachmentIndex}]`, attachment, {
        attachment: true,
      })).sort((left, right) => left.label.localeCompare(right.label));
    uniqueSorted(attachments.map((item) => item.label), `${label}.attachments`);
    const requiredRawLabel = entry.kind === "complete-bundle"
      ? "measurement-receipt" : "blocker-authority";
    if (!attachments.some((item) => item.label === requiredRawLabel)) {
      fail(`${label}.attachments`, `missing ${requiredRawLabel}`);
    }
    const entries = grouped.get(entry.family);
    const checkedEvidence = entry.kind === "complete-bundle"
      ? validateBundle(evidence, epoch, entries) : validateBlocker(evidence, epoch);
    if (checkedEvidence.family !== entry.family) {
      fail(label, "entry family differs from evidence family");
    }
    if (raw.mode === "real" && entry.kind === "complete-bundle" &&
        checkedEvidence.provenance.timingAuthority !== "real") {
      fail(label, "real adjudication rejects fixture timings");
    }
    const rawAuthority = attachments.find((item) => item.label === requiredRawLabel);
    if (rawAuthority.sha256 !== checkedEvidence.provenance.artifactDigest) {
      fail(label, `${requiredRawLabel} bytes do not match provenance.artifactDigest`);
    }
    if (entry.kind === "complete-bundle") {
      for (const alternative of checkedEvidence.alternatives) {
        const retained = attachments.find((item) =>
          item.label === `alternative-${alternative.category}`);
        if (!retained || retained.sha256 !== alternative.evidenceDigest) {
          fail(label, `missing physical negative evidence for ${alternative.category}`);
        }
      }
      const native = attachments.find((item) => item.label === "native-alternative");
      if (!native || native.sha256 !== checkedEvidence.nativeAlternative.evidenceDigest) {
        fail(label, "missing physical handwritten-native negative evidence");
      }
    }
    const logicalAttachments = attachments.map(({ label: itemLabel, bytes, sha256: hash }) => ({
      label: itemLabel, bytes, sha256: hash,
    }));
    const attachmentPayload = {
      family: entry.family,
      kind: entry.kind,
      evidence: { bytes: evidenceDescriptor.bytes, sha256: evidenceDescriptor.sha256 },
      attachments: logicalAttachments,
    };
    const attachmentSet = {
      schema: ATTACHMENT_SET_SCHEMA,
      id: contentIdentity(ATTACHMENT_SET_SCHEMA, attachmentPayload),
      ...attachmentPayload,
    };
    const checked = {
      family: entry.family,
      kind: entry.kind,
      entries,
      evidence: checkedEvidence,
      evidenceDescriptor,
      attachments,
      attachmentSet,
    };
    return { ...checked, ...validateAuthorityJoin(checked, { root, epoch }) };
  }).sort((left, right) => left.family.localeCompare(right.family));
  if (canonicalJson(families.map((entry) => entry.family)) !==
      canonicalJson(EXPECTED_FAMILIES)) {
    fail("authoritative input.families", "must contain each family exactly once");
  }
  for (const entry of families) {
    if (entry.kind === "complete-bundle") {
      const claimed = entry.evidence.matureCapability;
      if (claimed.capabilityId !== entry.capability.id ||
          claimed.declarationId !== entry.declaration.id ||
          claimed.libraryArtifactId !== entry.capability.libraryArtifactId ||
          claimed.status !== entry.capability.status) {
        fail(entry.family, "bundle capability claims do not join current validated authority");
      }
    } else {
      const retained = entry.evidence.retainedRoute;
      if (retained.capabilityId !== entry.capability.id ||
          retained.declarationId !== entry.declaration.id ||
          retained.libraryArtifactId !== entry.capability.libraryArtifactId ||
          retained.boundaryId !== entry.capability.boundaryId ||
          entry.capability.status !== "available") {
        fail(entry.family, "retained route does not join current validated authority");
      }
      if (entry.family !== "cubic-factorization" &&
          entry.evidence.proposedIntervention.capabilityStatus !== entry.capability.status) {
        fail(entry.family, "incomplete proposal does not join current capability status");
      }
    }
  }
  return { schema: raw.schema, mode: raw.mode, families };
}

function createPublicSubject(epoch, workload, family) {
  const subject = createDocument("subject", {
    authority: {
      kind: "reviewed-contract",
      producer: "optimization.campaign2-discovery.v2",
      validatedInputIds: [epoch.id, workload.id].sort(),
    },
    binding: { epochId: epoch.id, state: "current", predecessorIds: [] },
    name: `${family} complete public boundary`,
    scope: "public-call",
    locator: {
      workloadId: workload.id,
      entryPath: workload.publicEntry.path,
      publicName: workload.publicEntry.name,
      mode: workload.publicEntry.mode,
      outputBoundary: workload.publicEntry.outputBoundary,
    },
    relations: [],
  }, { workloads: [workload] });
  return validateSubject(subject, { workloads: [workload] });
}

function createEvidenceObservation({ epoch, entry, subject }) {
  const isComplete = entry.kind === "complete-bundle";
  const samples = isComplete
    ? entry.evidence.boundary.roles.flatMap((role) =>
      role.pairs.map((pair) => pair.candidateMicroseconds)) : [0];
  const included = isComplete ? entry.evidence.boundary.included :
    [...new Set(entry.entries.flatMap((item) =>
      item.specification.costBoundary.included))].sort();
  const excluded = isComplete ? entry.evidence.boundary.excluded :
    [...new Set(entry.entries.flatMap((item) =>
      item.specification.costBoundary.excluded))].sort();
  const libraryArtifact = entry.capability.libraryArtifactId;
  const validatedInputIds = uniqueSorted([
    epoch.id,
    subject.id,
    entry.attachmentSet.id,
    entry.capability.id,
    entry.declaration.id,
    libraryArtifact,
    ...entry.entries.map((item) => item.workload.id),
  ], `${entry.family}.observation.inputs`);
  const details = {
    kind: isComplete ? "complete-bundle" : "typed-blocker",
    family: entry.family,
    attachmentSet: entry.attachmentSet,
    evidenceDescriptor: {
      bytes: entry.evidenceDescriptor.bytes,
      sha256: entry.evidenceDescriptor.sha256,
    },
    capabilityAuthority: entry.capability,
    declarationAuthority: entry.declaration,
    evidence: entry.evidence,
  };
  const oracleDigest = sha256(canonicalJson(details));
  return createDocument("observation", {
    authority: {
      kind: "trusted-integration",
      producer: "optimization.campaign2-authoritative-adjudicator.v2",
      validatedInputIds,
    },
    binding: { epochId: epoch.id, state: "current", predecessorIds: [] },
    subjectId: subject.id,
    workloadId: null,
    channel: isComplete ? "wall-time" : "output-semantics",
    scope: {
      kind: "complete-public",
      subjectId: subject.id,
      phaseId: null,
      parentObservationId: null,
      mutuallyExclusiveGroup: null,
    },
    measurement: {
      unit: isComplete ? "microseconds" : "count",
      samples,
      total: samples.reduce((sum, item) => sum + item, 0),
      attributed: 0,
      ambiguous: 0,
      unmatched: 0,
      stale: 0,
    },
    costBoundary: { included: [...included].sort(), excluded: [...excluded].sort() },
    oracle: { status: "pass", outputDigest: oracleDigest, exceptionDigest: null },
    provenance: {
      producerCommand: entry.evidence.provenance.producerCommand,
      artifactDigest: entry.evidenceDescriptor.sha256,
      recordedAt: entry.evidence.provenance.recordedAt,
    },
    details,
  });
}

function accountingComplete(boundary) {
  if (!boundary.complete) return false;
  return boundary.roles.every((role) => {
    if (!role.cleanupComplete) return false;
    for (let index = 0; index < 11; index += 1) {
      if (role.baseline.liveBefore[index] !== role.baseline.liveAfter[index] ||
          role.candidate.liveBefore[index] !== role.candidate.liveAfter[index]) return false;
      if (role.baseline.highWater[index] < role.baseline.liveBefore[index] ||
          role.candidate.highWater[index] < role.candidate.liveBefore[index]) return false;
    }
    return true;
  });
}

function platformComplete(bundle) {
  return bundle.platform.correctFallback && bundle.platform.capabilityGuardBeforeEffects;
}

function semanticComplete(semantics) {
  return Object.values(semantics).every((value) => value === true);
}

function dimensions(bundle) {
  const pairDeltas = bundle.boundary.roles.flatMap((role) => role.pairs.map((pair) =>
    pair.baselineMicroseconds - pair.candidateMicroseconds));
  const resourceDeltas = bundle.boundary.roles.flatMap((role) =>
    role.baseline.copiedBytes.map((bytes, index) =>
      (bytes + role.baseline.allocations[index]) -
      (role.candidate.copiedBytes[index] + role.candidate.allocations[index])));
  return {
    semanticConfidence: semanticComplete(bundle.semantics) ? "high" : "low",
    removableWallLowerMicroseconds: Math.max(0, Math.min(...pairDeltas)),
    independentWorkloads: 2,
    matureComponents: bundle.matureCapability.status === "available" ? 1 : 0,
    portabilityCoverage: bundle.platform.nativePlatforms.length +
      bundle.platform.fallbackPlatforms.length,
    rollbackSimplicity: bundle.semantics.guardedFallback ? "simple" : "complex",
    resourceReduction: Math.min(...resourceDeltas),
    maintenanceSurface: 2,
    overhead: Math.max(...bundle.boundary.roles.flatMap(
      (role) => role.candidate.crossings,
    )),
  };
}

function alternativeDispositions(entry) {
  if (entry.kind === "complete-bundle") {
    return entry.evidence.alternatives.map((alternative) => ({
      category: alternative.category,
      disposition: alternative.disposition,
      reason: `${alternative.mechanism}; physical evidence ${alternative.evidenceDigest}`,
    })).sort((left, right) => left.category.localeCompare(right.category));
  }
  if (entry.family !== "cubic-factorization") {
    return ALTERNATIVE_CATEGORIES.map((category) => ({
      category,
      disposition: "investigate",
      reason: `zero-sample blocker retains no current ${category} comparison authority`,
    })).sort((left, right) => left.category.localeCompare(right.category));
  }
  const reasons = {
    algorithm: "a broader class-number algorithm remains outside this rejected batch proposal",
    boundary: "a new full-factor batch adapter is the unavailable mechanism",
    cache: "the reviewed public calls have no authenticated reuse contract",
    compiler: "a compiled factor kernel duplicates the mature per-prime FLINT route",
    representation: "persistent representation does not supply complete factor records",
    runtime: "dispatch cannot create the missing full-factor batch capability",
    source: "the current source already has a specialized cubic factor route",
  };
  return ALTERNATIVE_CATEGORIES.map((category) => ({
    category,
    disposition: category === "algorithm" ? "investigate"
      : category === "boundary" || category === "runtime" ? "inferior"
        : category === "cache" || category === "representation" ? "not-causal" : "duplicate",
    reason: reasons[category],
  })).sort((left, right) => left.category.localeCompare(right.category));
}

function proposalForEntry(entry, observation) {
  const isComplete = entry.kind === "complete-bundle";
  const evidence = entry.evidence;
  const mechanism = FAMILY_MECHANISMS[entry.family];
  const interruptionComplete = isComplete &&
    evidence.matureCapability.interruption.status === "complete";
  const interruptionId = interruptionComplete ? observation.id : contentIdentity(
    "sagejs.optimization-campaign2-missing-authority/v1",
    { family: entry.family, kind: "interruption", observationId: observation.id },
  );
  return {
    category: "library-route",
    owner: "optimization-engine",
    mechanism: isComplete ? mechanism.mechanism : evidence.proposedIntervention.mechanism,
    changedComponents: [...mechanism.changedComponents].sort(),
    sourceRelationship: "not-applicable",
    evidenceBoundary: "complete-public-call",
    fallback: {
      kind: "guarded-source",
      entry: "capability and domain guard before candidate allocation or publication",
      rollback: "untouched current public route",
    },
    costTransfer: {
      removes: [...mechanism.removes].sort(),
      adds: [...mechanism.adds].sort(),
    },
    matureCapability: {
      status: isComplete ? evidence.matureCapability.status :
        evidence.proposedIntervention.capabilityStatus,
      capabilityIds: [entry.capability.id],
      auditEvidenceIds: [entry.declaration.id, observation.id].sort(),
    },
    semanticObligations: [
      "exact complete public outputs and exceptions",
      "no partial publication before candidate success",
      "proof-mode behavior is unchanged",
    ].sort(),
    architectureObligations: [
      "declared mature library capability",
      "no new handwritten native algorithm",
      "ordinary Python public source",
    ].sort(),
    platformObligations: [
      "capability guard before effects",
      "correct browser fallback",
      "correct Windows fallback",
    ].sort(),
    rejectionConditions: [
      "any exact output, exception, proof, resource, or fallback check fails",
      "any paired improvement is below ten percent",
      "any paired public result is not faster",
    ].sort(),
    alternativeDispositions: alternativeDispositions(entry),
    specific: {
      kind: "library-route",
      capabilityId: entry.capability.id,
      libraryArtifactId: entry.capability.libraryArtifactId,
      declarationId: entry.declaration.id,
      semanticMappingEvidenceIds: [observation.id],
      conversionObservationIds: [observation.id],
      boundaryObservationIds: [observation.id],
      resourceEvidenceIds: [observation.id],
      interruptionEvidenceIds: [interruptionId],
      batchingObservationIds: [observation.id],
      residencyObservationIds: [observation.id],
    },
  };
}

function analyzeEntry({ epoch, entry }) {
  const representative = entry.entries.find(
    (item) => item.workload.role === "representative",
  );
  const subject = createPublicSubject(epoch, representative.workload, entry.family);
  const observation = createEvidenceObservation({ epoch, entry, subject });
  const evidence = [observation, entry.capability, entry.declaration, ...epoch.components];
  const audited = auditIntervention({
    epoch,
    subject,
    proposal: proposalForEntry(entry, observation),
  }, { evidence, components: epoch.components });
  if (entry.kind === "blocker") {
    return {
      family: entry.family,
      kind: entry.kind,
      subject,
      observation,
      intervention: audited.intervention,
      audit: audited.audit,
      candidate: null,
      attachmentSet: entry.attachmentSet,
      authorityIds: [entry.capability.id, entry.declaration.id],
    };
  }
  const bundle = entry.evidence;
  const candidate = {
    intervention: audited.intervention,
    audit: audited.audit,
    feasibility: {
      epochId: epoch.id,
      outputEquivalent: bundle.semantics.outputEquivalent &&
        bundle.semantics.exceptionEquivalent && bundle.semantics.proofModeEquivalent,
      fallbackComplete: bundle.semantics.guardedFallback &&
        bundle.platform.capabilityGuardBeforeEffects,
      costBoundaryComplete: accountingComplete(bundle.boundary),
      matureAuditComplete: bundle.matureCapability.status === "available" &&
        bundle.matureCapability.capabilityAuditComplete &&
        bundle.matureCapability.batchingComplete &&
        bundle.matureCapability.residencyComplete,
      semanticObligationsResolved: semanticComplete(bundle.semantics),
      platformFallbackComplete: platformComplete(bundle),
      negativeEvidenceRetained: bundle.alternatives.length === 7 &&
        bundle.nativeAlternative.disposition !== "investigate",
      comparisons: bundle.boundary.roles.map((role) => ({
        role: role.role,
        workloadId: role.workloadId,
        pairs: role.pairs,
      })),
      dimensions: dimensions(bundle),
      missingAuthority: audited.audit.status === "investigate",
    },
  };
  return {
    family: entry.family,
    kind: entry.kind,
    subject,
    observation,
    intervention: audited.intervention,
    audit: audited.audit,
    candidate,
    attachmentSet: entry.attachmentSet,
    authorityIds: [entry.capability.id, entry.declaration.id],
  };
}

function familyEntries(root) {
  const entries = [...workloadIndex(root).values()];
  const result = new Map();
  for (const entry of entries) {
    const list = result.get(entry.specification.family) || [];
    list.push(entry);
    result.set(entry.specification.family, list);
  }
  return result;
}

function familyDispositions(analyses, adjudication) {
  const gates = new Map(adjudication.hardGates.map(
    (entry) => [entry.interventionId, entry.gates],
  ));
  return analyses.map((analysis) => {
    if (analysis.kind === "blocker") {
      const blocker = analysis.observation.details.evidence;
      const disposition = {
        family: analysis.family,
        interventionId: analysis.intervention.id,
        disposition: blocker.proposedIntervention.disposition,
        failedGates: [...blocker.proposedIntervention.failedGates],
        missingAuthorities: [...blocker.missingAuthorities],
        retainedInvestigation: blocker.retainedRoute.mechanism,
        fixtureTimingsUsed: false,
      };
      if (analysis.family === "cubic-factorization") {
        disposition.rejectedMechanism =
          "unavailable batch full-factor mature-library route";
      }
      return disposition;
    }
    const id = analysis.intervention.id;
    let disposition = "reject";
    if (id === adjudication.selectedInterventionId) disposition = "select";
    else if (analysis.audit.status === "investigate" ||
             analysis.candidate.feasibility.missingAuthority) disposition = "investigate";
    return {
      family: analysis.family,
      interventionId: id,
      disposition,
      failedGates: gates.get(id).filter((gate) => gate.status === "fail")
        .map((gate) => gate.code),
    };
  }).sort((left, right) => left.family.localeCompare(right.family));
}

function createDecisionObservation({ epoch, input, analyses, adjudication, dispositions }) {
  const selected = analyses.find((analysis) =>
    analysis.intervention.id === adjudication.selectedInterventionId);
  const anchor = selected || analyses.find((analysis) =>
    analysis.family === "dense-integral") || analyses[0];
  const observationIds = analyses.map((analysis) => analysis.observation.id).sort();
  const interventionIds = analyses.map((analysis) => analysis.intervention.id).sort();
  const attachmentSetIds = analyses.map((analysis) => analysis.attachmentSet.id).sort();
  const authorityIds = analyses.flatMap((analysis) => analysis.authorityIds).sort();
  const result = {
    schema: ADJUDICATION_SCHEMA,
    epochId: epoch.id,
    mode: input.mode,
    familyDispositions: dispositions,
    adjudication,
    observationIds,
    interventionIds,
    attachmentSetIds,
  };
  const resultDigest = sha256(canonicalJson(result));
  const recordedAt = input.families.map((entry) =>
    entry.evidence.provenance.recordedAt).sort().at(-1);
  const observation = createDocument("observation", {
    authority: {
      kind: "validated-input-set",
      producer: "optimization.campaign2-authoritative-adjudicator.v2",
      validatedInputIds: uniqueSorted([
        epoch.id,
        ...observationIds,
        ...interventionIds,
        ...attachmentSetIds,
        ...authorityIds,
      ], "decision inputs"),
    },
    binding: { epochId: epoch.id, state: "current", predecessorIds: [] },
    subjectId: anchor.subject.id,
    workloadId: null,
    channel: "output-semantics",
    scope: {
      kind: "complete-public",
      subjectId: anchor.subject.id,
      phaseId: null,
      parentObservationId: null,
      mutuallyExclusiveGroup: null,
    },
    measurement: {
      unit: "count",
      samples: [analyses.length],
      total: analyses.length,
      attributed: 0,
      ambiguous: 0,
      unmatched: 0,
      stale: 0,
    },
    costBoundary: {
      included: ["all Campaign 2 family evidence and deterministic hard gates"],
      excluded: [],
    },
    oracle: { status: "pass", outputDigest: resultDigest, exceptionDigest: null },
    provenance: {
      producerCommand: "node bench/optimization-engine/campaign2-discovery.cjs adjudicate",
      artifactDigest: resultDigest,
      recordedAt,
    },
    details: { kind: "global-adjudication", result },
  });
  return { observation, result };
}

function createOpportunities({ epoch, analyses, dispositions, decisionObservation }) {
  return analyses.map((analysis) => {
    const disposition = dispositions.find((item) => item.family === analysis.family);
    const intervention = analysis.intervention;
    const opportunity = createDocument("opportunity", {
      authority: {
        kind: "validated-input-set",
        producer: "optimization.campaign2-authoritative-adjudicator.v2",
        validatedInputIds: uniqueSorted([
          epoch.id,
          analysis.subject.id,
          analysis.observation.id,
          intervention.id,
          decisionObservation.id,
        ], `${analysis.family}.opportunity.inputs`),
      },
      binding: { epochId: epoch.id, state: "current", predecessorIds: [] },
      subjectId: analysis.subject.id,
      observationIds: [analysis.observation.id],
      classifications: [{
        kind: "library-capability",
        observationIds: [analysis.observation.id],
        explanation: analysis.kind === "blocker" && analysis.family === "cubic-factorization"
          ? "the exact batch full-factor proposal is unavailable; the per-prime route remains investigate"
          : analysis.kind === "blocker"
            ? "current evidence is zero-sample and the declared route remains investigate"
          : "the reviewed library route is bound to complete physical evidence",
      }],
      interventionIds: [intervention.id],
      losingEvidenceIds: disposition.disposition === "select"
        ? analyses.filter((item) => item !== analysis).map((item) =>
          item.intervention.id).sort()
        : [decisionObservation.id],
      unresolvedObligations: analysis.kind === "blocker"
        ? uniqueSorted([
          ...analysis.observation.details.evidence.missingAuthorities,
          ...disposition.failedGates,
        ], `${analysis.family}.blocker.unresolved`)
        : disposition.disposition === "investigate"
          ? uniqueSorted([
            "one or more required authorities are missing", ...disposition.failedGates,
          ], `${analysis.family}.unresolved`) : disposition.failedGates,
      decision: {
        status: disposition.disposition,
        selectedInterventionId: disposition.disposition === "select" ? intervention.id : null,
        reasons: [analysis.kind === "blocker" && disposition.disposition === "reject"
          ? "the exact proposed batched full-factor mature capability is unavailable"
          : analysis.kind === "blocker"
            ? "current zero-sample evidence lacks required authorities"
          : disposition.disposition === "select"
            ? "every hard gate passed and deterministic adjudication selected this intervention"
            : disposition.disposition === "investigate"
              ? "a required authority is missing"
              : "one or more deterministic hard gates failed"],
      },
    }, {
      observations: [analysis.observation],
      interventions: [intervention],
    });
    return { family: analysis.family, opportunity };
  }).sort((left, right) => left.family.localeCompare(right.family));
}

function adjudicateCampaign2({ root, epoch: rawEpoch, input: rawInput }) {
  const epoch = validateEpoch(rawEpoch);
  const workloads = campaign2Workloads(root);
  const missingWorkloads = workloads.filter((workload) => !epoch.workloadIds.includes(workload.id));
  if (missingWorkloads.length > 0) {
    fail("epoch", `does not bind ${missingWorkloads.length} reviewed Campaign 2 workloads`);
  }
  const input = validateAuthoritativeInput(rawInput, { root, epoch });
  const analyses = input.families.map((entry) => analyzeEntry({ epoch, entry }));
  const candidates = analyses.filter((analysis) => analysis.candidate !== null)
    .map((analysis) => analysis.candidate)
    .sort((left, right) => left.intervention.id.localeCompare(right.intervention.id));
  const adjudication = candidates.length > 0
    ? adjudicateCandidates({ epochId: epoch.id, candidates })
    : Object.freeze({
      status: analyses.some((analysis) =>
        analysis.observation.details.evidence.proposedIntervention.disposition ===
          "investigate") ? "investigate" : "reject",
      selectedInterventionId: null,
      hardGates: analyses.map((analysis) => ({
        interventionId: analysis.intervention.id,
        gates: analysis.observation.details.evidence.proposedIntervention.failedGates
          .map((code) => ({ code, status: "fail" })),
      })).sort((left, right) =>
        left.interventionId.localeCompare(right.interventionId)),
      dimensions: [],
      pairwiseComparisons: [],
      reasons: ["every family is a zero-sample typed blocker; no selectable candidate exists"],
    });
  const dispositions = familyDispositions(analyses, adjudication);
  const decision = createDecisionObservation({
    epoch, input, analyses, adjudication, dispositions,
  });
  const opportunities = createOpportunities({
    epoch, analyses, dispositions, decisionObservation: decision.observation,
  });
  const selected = analyses.find((analysis) =>
    analysis.intervention.id === adjudication.selectedInterventionId);
  let dossier = null;
  if (selected) {
    const opportunity = opportunities.find((item) => item.family === selected.family).opportunity;
    dossier = createDossier({
      opportunity,
      intervention: selected.intervention,
      observationIds: [selected.observation.id],
    });
  }
  const documents = [
    epoch,
    ...workloads,
    ...analyses.map((analysis) => analysis.subject),
    ...analyses.map((analysis) => analysis.observation),
    ...analyses.map((analysis) => analysis.intervention),
    decision.observation,
    ...opportunities.map((item) => item.opportunity),
    ...(dossier ? [dossier] : []),
  ];
  const stream = canonicalRecordStream(documents);
  const roundTrip = parseCanonicalRecordStream(stream.bytes);
  if (roundTrip.logicalId !== stream.logicalId) fail("canonical stream", "round trip changed ID");
  return {
    schema: ADJUDICATION_SCHEMA,
    epochId: epoch.id,
    mode: input.mode,
    familyDispositions: dispositions,
    adjudication,
    decisionObservationId: decision.observation.id,
    opportunityIds: Object.fromEntries(opportunities.map((item) => [
      item.family, item.opportunity.id,
    ])),
    dossierId: dossier?.id || null,
    canonical: {
      logicalId: stream.logicalId,
      recordCount: stream.records.length,
      ndjsonSha256: sha256(stream.bytes),
    },
    documents: stream.records.map((record) => record.document),
  };
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.resolve(filename), "utf8"));
}

function main(argv = process.argv.slice(2)) {
  const root = path.resolve(__dirname, "../..");
  const [command, ...args] = argv;
  if (command === "contracts") {
    process.stdout.write(`${JSON.stringify(campaign2Workloads(root), null, 2)}\n`);
    return;
  }
  if (command === "plan") {
    const entry = workloadIndex(root).get(args[0]);
    if (!entry) fail("plan", `unknown workload ${args[0]}`);
    process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
    return;
  }
  if (command === "measure") {
    const epochFilename = args[1] || process.env.SAGEJS_CAMPAIGN2_EPOCH;
    const evidenceFilename = args[2] || process.env.SAGEJS_CAMPAIGN2_EVIDENCE;
    if (args.length !== 1 && args.length !== 3) {
      fail("measure", "usage: measure <workload-key> [epoch.json evidence.json]");
    }
    if (!epochFilename || !evidenceFilename) {
      fail("measure", "set the epoch/evidence files or pass both explicitly");
    }
    const entry = workloadIndex(root).get(args[0]);
    if (!entry) fail("measure", `unknown workload ${args[0]}`);
    const epoch = validateEpoch(readJson(epochFilename));
    const checked = validateBundle(
      readJson(evidenceFilename), epoch, familyEntries(root).get(entry.specification.family),
    );
    process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
    return;
  }
  if (command === "adjudicate") {
    if (args.length !== 2) {
      fail("adjudicate", "usage: adjudicate <epoch.json> <authoritative-input.json>");
    }
    const epoch = readJson(args[0]);
    const epochService = require("../../tools/optimization-engine/epoch-service.cjs");
    epochService.verifyEpoch({ epoch, root, requireCurrent: true });
    const result = adjudicateCampaign2({
      root, epoch, input: readJson(args[1]),
    });
    epochService.verifyEpoch({ epoch, root, requireCurrent: true });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  fail("command", "use contracts, plan, measure, or adjudicate");
}

if (require.main === module) main();

module.exports = Object.freeze({
  ADJUDICATION_SCHEMA,
  ALTERNATIVE_CATEGORIES,
  ATTACHMENT_SET_SCHEMA,
  AUTHORITATIVE_INPUT_SCHEMA,
  BLOCKER_FAILED_GATES,
  BLOCKER_SCHEMA,
  CAPABILITY_AUTHORITY_SCHEMA,
  COUNTER_FIELDS,
  DECLARATION_AUTHORITY_SCHEMA,
  DISCOVERY_SCHEMA,
  adjudicateCampaign2,
  main,
  validateAuthoritativeInput,
  validateBlocker,
  validateBundle,
});

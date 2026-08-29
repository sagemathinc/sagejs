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
} = require("../../tools/optimizer-development/common.cjs");
const {
  INTERVENTION_CATEGORIES,
  createDocument,
  validateEpoch,
  validateSubject,
} = require("../../tools/optimization-engine/contracts.cjs");
const {
  adjudicateCandidates,
  auditIntervention,
} = require("../../tools/optimization-engine/auditors.cjs");
const {
  campaign2Workloads,
  workloadIndex,
} = require("./campaign2-workloads.cjs");

const DISCOVERY_SCHEMA = "sagejs.optimization-campaign2-discovery-evidence/v1";
const ALTERNATIVE_CATEGORIES = Object.freeze(
  INTERVENTION_CATEGORIES.filter((category) => category !== "library-route"),
);
const COUNTER_FIELDS = Object.freeze([
  "conversionMicroseconds", "crossings", "copiedBytes", "allocations",
  "resultConstructions", "liveBefore", "liveAfter", "highWater",
]);

const FAMILY_MECHANISMS = Object.freeze({
  "dense-integral": Object.freeze({
    mechanism: "Split at characteristic holes and run FLINT nmod_poly_integral on every legal block",
    changedComponents: ["public polynomial integral route"],
    removes: ["per-coefficient dynamic field division"],
    adds: ["characteristic-hole preflight", "FLINT block calls", "block placement"],
  }),
  "cubic-factorization": Object.freeze({
    mechanism: "Batch cubic modular factorizations through the mature FLINT factorization capability",
    changedComponents: ["cubic class-number factor production route"],
    removes: ["per-prime specialized Python factorization"],
    adds: ["batched foreign conversion", "FLINT factorization", "record validation"],
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

function checkedBoolean(label, value) {
  if (typeof value !== "boolean") fail(label, "must be boolean");
  return value;
}

function checkedNumber(label, value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(label, "must be a nonnegative finite number");
  }
  return value;
}

function checkedInteger(label, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(label, "must be a nonnegative safe integer");
  }
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
  for (let index = 0; index < value.pairs.length; index += 1) {
    const expectedOrder = index % 2 === 0 ? "ABBA" : "BAAB";
    if (value.pairs[index].order !== expectedOrder) {
      fail(`${label}.pairs[${index}].order`, `must be ${expectedOrder}`);
    }
  }
  const baseline = validateCounters(`${label}.baseline`, value.baseline);
  const candidate = validateCounters(`${label}.candidate`, value.candidate);
  const cleanupComplete = checkedBoolean(`${label}.cleanupComplete`, value.cleanupComplete);
  return {
    role: value.role,
    workloadId: value.workloadId,
    pairs: value.pairs,
    baseline,
    candidate,
    cleanupComplete,
  };
}

function validateAlternatives(value) {
  if (!Array.isArray(value) || value.length !== ALTERNATIVE_CATEGORIES.length) {
    fail("alternatives", "must retain one disposition for every non-library category");
  }
  const checked = value.map((item, index) => {
    const label = `alternatives[${index}]`;
    exactKeys(label, item, ["category", "mechanism", "disposition", "evidenceDigest"]);
    if (!ALTERNATIVE_CATEGORIES.includes(item.category)) {
      fail(`${label}.category`, `unknown alternative category ${item.category}`);
    }
    if (typeof item.mechanism !== "string" || item.mechanism.length === 0) {
      fail(`${label}.mechanism`, "must be nonempty");
    }
    if (!new Set(["inferior", "unavailable", "duplicate", "not-causal", "investigate"])
      .has(item.disposition)) {
      fail(`${label}.disposition`, `unknown disposition ${item.disposition}`);
    }
    digest(`${label}.evidenceDigest`, item.evidenceDigest);
    return item;
  });
  const categories = checked.map((item) => item.category);
  const sorted = [...categories].sort();
  if (JSON.stringify(categories) !== JSON.stringify(sorted) || new Set(categories).size !== 7) {
    fail("alternatives", "must use deterministic unique category order");
  }
  const compiler = checked.find((item) => item.category === "compiler");
  if (!compiler.mechanism.includes("V8") || !compiler.mechanism.includes("Wasm")) {
    fail("alternatives.compiler", "must retain both V8 and Wasm evidence");
  }
  return checked;
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
    "producerCommand", "artifactDigest", "recordedAt",
  ]);
  if (typeof raw.provenance.producerCommand !== "string" ||
      raw.provenance.producerCommand.length === 0) {
    fail(`${label}.provenance.producerCommand`, "must be nonempty");
  }
  digest(`${label}.provenance.artifactDigest`, raw.provenance.artifactDigest);
  if (new Date(raw.provenance.recordedAt).toISOString() !== raw.provenance.recordedAt) {
    fail(`${label}.provenance.recordedAt`, "must be a canonical ISO timestamp");
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
  if (typeof raw.matureCapability.interruption.policy !== "string" ||
      raw.matureCapability.interruption.policy.length === 0) {
    fail(`${label}.matureCapability.interruption.policy`, "must be nonempty");
  }
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
  for (const [field, value] of Object.entries(raw.semantics)) {
    checkedBoolean(`${label}.semantics.${field}`, value);
  }
  exactKeys(`${label}.platform`, raw.platform, [
    "nativePlatforms", "fallbackPlatforms", "fallbackBrowsers",
    "correctFallback", "capabilityGuardBeforeEffects",
  ]);
  if (!Array.isArray(raw.platform.nativePlatforms) ||
      !Array.isArray(raw.platform.fallbackPlatforms) ||
      !Array.isArray(raw.platform.fallbackBrowsers)) {
    fail(`${label}.platform`, "coverage fields must be arrays");
  }
  checkedBoolean(`${label}.platform.correctFallback`, raw.platform.correctFallback);
  checkedBoolean(
    `${label}.platform.capabilityGuardBeforeEffects`,
    raw.platform.capabilityGuardBeforeEffects,
  );
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
  if (typeof raw.nativeAlternative.mechanism !== "string" ||
      !raw.nativeAlternative.mechanism.includes("native")) {
    fail(`${label}.nativeAlternative.mechanism`, "must retain handwritten native evidence");
  }
  digest(`${label}.nativeAlternative.evidenceDigest`, raw.nativeAlternative.evidenceDigest);
  return { ...raw, boundary: { ...raw.boundary, roles }, alternatives };
}

function evidenceRecord(epochId, kind, payload) {
  const id = contentIdentity(`sagejs.optimization-campaign2-${kind}/v1`, payload);
  return { id, epochId };
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

function platformComplete(bundle, entries) {
  const requiredPlatforms = new Set(entries.flatMap((entry) => entry.workload.platforms));
  const coveredPlatforms = new Set([
    ...bundle.platform.nativePlatforms,
    ...bundle.platform.fallbackPlatforms,
  ]);
  const requiredBrowsers = new Set(entries.flatMap((entry) => entry.workload.browsers));
  const coveredBrowsers = new Set(bundle.platform.fallbackBrowsers);
  return bundle.platform.correctFallback && bundle.platform.capabilityGuardBeforeEffects &&
    [...requiredPlatforms].every((item) => coveredPlatforms.has(item)) &&
    [...requiredBrowsers].every((item) => coveredBrowsers.has(item));
}

function semanticComplete(semantics) {
  return Object.values(semantics).every((value) => value === true);
}

function libraryEvidence(epoch, bundle) {
  const records = [];
  const add = (kind, payload) => {
    const record = evidenceRecord(epoch.id, kind, payload);
    records.push(record);
    return record.id;
  };
  const specific = {
    kind: "library-route",
    capabilityId: bundle.matureCapability.capabilityId,
    libraryArtifactId: bundle.matureCapability.libraryArtifactId,
    declarationId: bundle.matureCapability.declarationId,
    semanticMappingEvidenceIds: [add("semantic-mapping", bundle.semantics)],
    conversionObservationIds: [add("conversion-observation", bundle.boundary.roles.map(
      (role) => ({ workloadId: role.workloadId, baseline: role.baseline.conversionMicroseconds,
        candidate: role.candidate.conversionMicroseconds }),
    ))],
    boundaryObservationIds: [add("boundary-observation", bundle.boundary.roles.map(
      (role) => ({ workloadId: role.workloadId, baseline: role.baseline.crossings,
        candidate: role.candidate.crossings }),
    ))],
    resourceEvidenceIds: [add("resource-evidence", bundle.boundary.roles.map((role) => ({
      workloadId: role.workloadId,
      baseline: {
        copiedBytes: role.baseline.copiedBytes, allocations: role.baseline.allocations,
        liveBefore: role.baseline.liveBefore, liveAfter: role.baseline.liveAfter,
        highWater: role.baseline.highWater,
      },
      candidate: {
        copiedBytes: role.candidate.copiedBytes, allocations: role.candidate.allocations,
        liveBefore: role.candidate.liveBefore, liveAfter: role.candidate.liveAfter,
        highWater: role.candidate.highWater,
      },
      cleanupComplete: role.cleanupComplete,
    })))],
    interruptionEvidenceIds: [],
    batchingObservationIds: [add("batching-observation", {
      complete: bundle.matureCapability.batchingComplete,
      family: bundle.family,
    })],
    residencyObservationIds: [add("residency-observation", {
      complete: bundle.matureCapability.residencyComplete,
      family: bundle.family,
    })],
  };
  const interruptionId = contentIdentity(
    "sagejs.optimization-campaign2-interruption-evidence/v1",
    bundle.matureCapability.interruption,
  );
  specific.interruptionEvidenceIds.push(interruptionId);
  if (bundle.matureCapability.interruption.status === "complete") {
    records.push({ id: interruptionId, epochId: epoch.id });
  }
  const capabilityAuditId = contentIdentity(
    "sagejs.optimization-campaign2-capability-audit/v1",
    bundle.matureCapability,
  );
  if (bundle.matureCapability.status === "available" &&
      bundle.matureCapability.capabilityAuditComplete) {
    records.push(
      { id: bundle.matureCapability.capabilityId, epochId: epoch.id },
      { id: bundle.matureCapability.libraryArtifactId, epochId: epoch.id },
      { id: bundle.matureCapability.declarationId, epochId: epoch.id },
      { id: capabilityAuditId, epochId: epoch.id },
    );
  }
  for (const alternative of bundle.alternatives) {
    records.push(evidenceRecord(epoch.id, `alternative-${alternative.category}`, alternative));
  }
  records.push(evidenceRecord(epoch.id, "native-alternative", bundle.nativeAlternative));
  return { specific, capabilityAuditId, records };
}

function dimensions(bundle) {
  const pairDeltas = bundle.boundary.roles.flatMap((role) => role.pairs.map((pair) =>
    pair.baselineMicroseconds - pair.candidateMicroseconds));
  const resourceDeltas = bundle.boundary.roles.flatMap((role) =>
    role.baseline.copiedBytes.map((bytes, index) =>
      (bytes + role.baseline.allocations[index]) -
      (role.candidate.copiedBytes[index] + role.candidate.allocations[index])));
  const covered = new Set([
    ...bundle.platform.nativePlatforms,
    ...bundle.platform.fallbackPlatforms,
  ]);
  return {
    semanticConfidence: semanticComplete(bundle.semantics) ? "high" : "low",
    removableWallLowerMicroseconds: Math.max(0, Math.min(...pairDeltas)),
    independentWorkloads: 2,
    matureComponents: bundle.matureCapability.status === "available" ? 1 : 0,
    portabilityCoverage: covered.size,
    rollbackSimplicity: bundle.semantics.guardedFallback ? "simple" : "complex",
    resourceReduction: Math.min(...resourceDeltas),
    maintenanceSurface: 2,
    overhead: Math.max(...bundle.boundary.roles.flatMap(
      (role) => role.candidate.crossings,
    )),
  };
}

function analyzeBundle({ epoch, bundle, entries }) {
  const checked = validateBundle(bundle, epoch, entries);
  const representative = entries.find((entry) => entry.workload.role === "representative");
  const subject = createPublicSubject(epoch, representative.workload, checked.family);
  const evidence = libraryEvidence(epoch, checked);
  const alternatives = checked.alternatives.map((alternative) => ({
    category: alternative.category,
    disposition: alternative.disposition,
    reason: `${alternative.mechanism}; evidence ${alternative.evidenceDigest}`,
  }));
  const mechanism = FAMILY_MECHANISMS[checked.family];
  const proposal = {
    category: "library-route",
    owner: "optimization-engine",
    mechanism: mechanism.mechanism,
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
      status: checked.matureCapability.status,
      capabilityIds: [checked.matureCapability.capabilityId],
      auditEvidenceIds: [evidence.capabilityAuditId],
    },
    semanticObligations: [
      "exact complete public outputs and exceptions",
      "no partial publication before candidate success",
      "proof-mode behavior is unchanged",
    ].sort(),
    architectureObligations: [
      "ordinary Python public source",
      "declared mature library capability",
      "no new handwritten native algorithm",
    ].sort(),
    platformObligations: [
      "correct Windows fallback",
      "correct browser fallback",
      "capability guard before effects",
    ].sort(),
    rejectionConditions: [
      "any paired public result is not faster",
      "any paired improvement is below ten percent",
      "any exact output, exception, proof, resource, or fallback check fails",
    ].sort(),
    alternativeDispositions: alternatives,
    specific: evidence.specific,
  };
  const audited = auditIntervention({ epoch, subject, proposal }, { evidence: evidence.records });
  const candidate = {
    intervention: audited.intervention,
    audit: audited.audit,
    feasibility: {
      epochId: epoch.id,
      outputEquivalent: checked.semantics.outputEquivalent &&
        checked.semantics.exceptionEquivalent && checked.semantics.proofModeEquivalent,
      fallbackComplete: checked.semantics.guardedFallback &&
        checked.platform.capabilityGuardBeforeEffects,
      costBoundaryComplete: accountingComplete(checked.boundary),
      matureAuditComplete: checked.matureCapability.status === "available" &&
        checked.matureCapability.capabilityAuditComplete &&
        checked.matureCapability.batchingComplete &&
        checked.matureCapability.residencyComplete,
      semanticObligationsResolved: semanticComplete(checked.semantics),
      platformFallbackComplete: platformComplete(checked, entries),
      negativeEvidenceRetained: checked.alternatives.length === 7 &&
        checked.nativeAlternative.evidenceDigest.length === 64,
      comparisons: checked.boundary.roles.map((role) => ({
        role: role.role,
        workloadId: role.workloadId,
        pairs: role.pairs,
      })),
      dimensions: dimensions(checked),
      missingAuthority: audited.audit.status === "investigate",
    },
  };
  return { family: checked.family, subject, candidate, evidenceRecords: evidence.records };
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

function adjudicateCampaign2({ root, epoch: rawEpoch, bundles }) {
  const epoch = validateEpoch(rawEpoch);
  const grouped = familyEntries(root);
  const workloads = campaign2Workloads(root);
  const missingWorkloads = workloads.filter((workload) => !epoch.workloadIds.includes(workload.id));
  if (missingWorkloads.length > 0) {
    fail("epoch", `does not bind ${missingWorkloads.length} reviewed Campaign 2 workloads`);
  }
  if (!Array.isArray(bundles) || bundles.length !== grouped.size) {
    fail("bundles", "must contain exactly one evidence bundle for each family");
  }
  const analyses = bundles.map((bundle) => {
    const entries = grouped.get(bundle.family);
    if (!entries) fail("bundles", `unknown family ${bundle.family}`);
    return analyzeBundle({ epoch, bundle, entries });
  });
  if (new Set(analyses.map((analysis) => analysis.family)).size !== grouped.size) {
    fail("bundles", "must contain distinct families");
  }
  analyses.sort((left, right) => left.candidate.intervention.id.localeCompare(
    right.candidate.intervention.id,
  ));
  const adjudication = adjudicateCandidates({
    epochId: epoch.id,
    candidates: analyses.map((analysis) => analysis.candidate),
  });
  const gates = new Map(adjudication.hardGates.map((entry) => [entry.interventionId, entry.gates]));
  const familyDispositions = analyses.map((analysis) => {
    const id = analysis.candidate.intervention.id;
    let disposition = "reject";
    if (id === adjudication.selectedInterventionId) disposition = "select";
    else if (analysis.candidate.audit.status === "investigate" ||
             analysis.candidate.feasibility.missingAuthority) disposition = "investigate";
    return {
      family: analysis.family,
      interventionId: id,
      disposition,
      failedGates: gates.get(id).filter((gate) => gate.status === "fail").map((gate) => gate.code),
    };
  }).sort((left, right) => left.family.localeCompare(right.family));
  return {
    schema: "sagejs.optimization-campaign2-adjudication/v1",
    epochId: epoch.id,
    workloadIds: workloads.map((workload) => workload.id).sort(),
    familyDispositions,
    adjudication,
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
      fail(
        "measure",
        "set SAGEJS_CAMPAIGN2_EPOCH and SAGEJS_CAMPAIGN2_EVIDENCE or pass both files",
      );
    }
    const entry = workloadIndex(root).get(args[0]);
    if (!entry) fail("measure", `unknown workload ${args[0]}`);
    const epoch = validateEpoch(readJson(epochFilename));
    const grouped = familyEntries(root);
    const analysis = analyzeBundle({
      epoch,
      bundle: readJson(evidenceFilename),
      entries: grouped.get(entry.specification.family),
    });
    process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
    return;
  }
  if (command === "adjudicate") {
    if (args.length !== 2) fail("adjudicate", "usage: adjudicate <epoch.json> <bundles.json>");
    process.stdout.write(`${JSON.stringify(adjudicateCampaign2({
      root, epoch: readJson(args[0]), bundles: readJson(args[1]),
    }), null, 2)}\n`);
    return;
  }
  fail("command", "use contracts, plan, measure, or adjudicate");
}

if (require.main === module) main();

module.exports = Object.freeze({
  ALTERNATIVE_CATEGORIES,
  COUNTER_FIELDS,
  DISCOVERY_SCHEMA,
  adjudicateCampaign2,
  analyzeBundle,
  main,
  validateBundle,
});

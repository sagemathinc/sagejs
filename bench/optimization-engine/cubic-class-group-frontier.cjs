#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  attachIdentity,
  contentId,
  deepFreeze,
  digest,
  documentIdentity,
  exactKeys,
  finiteNumber,
  nonemptyString,
  safeInteger,
  sha256,
} = require("../../tools/optimizer-development/common.cjs");
const {
  CELL_IDS,
  PROOF_IDS,
  SYSTEM_IDS,
  SPECIFICATION_PATH,
  cubicClassGroupWorkloads,
  loadSpecifications,
  repositoryRoot,
  workloadIndex,
} = require("./cubic-class-group-workloads.cjs");

const FRONTIER_SCHEMA = "sagejs.cubic-class-group-frontier/v1";
const OBSERVATION_SCHEMA = "sagejs.cubic-class-group-frontier-observation/v1";
const FREEZE_SCHEMA = "sagejs.cubic-class-group-candidate-freeze/v1";
const AVAILABILITY = Object.freeze([
  "available", "unavailable", "unsupported", "timeout", "error",
]);
const PROOF_STRENGTHS = Object.freeze([
  "exact-relations-conditional-grh", "exact-unconditional",
]);
const PROOF_COMPONENTS = Object.freeze([
  "exact-relations-conditional-grh", "exact-unconditional", "not-requested",
]);
const REGULATOR_STRENGTHS = Object.freeze([
  "rigorous-conditional-grh", "rigorous-unconditional", "not-requested",
]);
const CARRIER_KINDS = Object.freeze([
  "absent", "detached-replayable", "internal-audited", "live-authenticated",
]);
const RELATIONSHIPS = Object.freeze(["equal", "incomparable", "subset", "superset"]);
const PROOF_RELATIONSHIPS = Object.freeze(["equal", "incomparable", "stronger", "weaker"]);
const COMPARISON_USES = Object.freeze([
  "diagnostic-only", "exact-frontier", "one-sided-lower-bound",
]);
const ACCOUNTING_UNITS = Object.freeze({
  affinityLogicalCpus: "count",
  cancellationPolls: "count",
  majorFaults: "count",
  nativeBytes: "bytes",
  nativeCrossings: "count",
  ownedResourceLifetimes: "count",
  peakRssBytes: "bytes",
  processCpuMicroseconds: "microseconds",
});
const ACCOUNTING_IDS = Object.freeze(Object.keys(ACCOUNTING_UNITS).sort());

function fail(label, message) {
  throw new Error(`cubic class-group frontier ${label}: ${message}`);
}

function enumeration(label, value, choices) {
  if (!choices.includes(value)) fail(label, `must be one of ${choices.join(", ")}`);
  return value;
}

function nullableDigest(label, value) {
  if (value === null) return null;
  return digest(label, value);
}

function nullableContentId(label, value) {
  if (value === null) return null;
  return contentId(label, value);
}

function isoTimestamp(label, value) {
  nonemptyString(label, value);
  if (new Date(value).toISOString() !== value) fail(label, "must be canonical UTC ISO-8601");
  return value;
}

function gitObject(label, value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    fail(label, "must be a lowercase 40-character Git identity");
  }
  return value;
}

function checkedBoolean(label, value) {
  if (typeof value !== "boolean") fail(label, "must be boolean");
  return value;
}

function array(label, value, check, { minimum = 0, unique = false, sorted = false } = {}) {
  if (!Array.isArray(value) || value.length < minimum) {
    fail(label, `must be an array with at least ${minimum} items`);
  }
  const result = value.map((item, index) => check(`${label}[${index}]`, item));
  if (unique && new Set(result).size !== result.length) fail(label, "must contain unique items");
  if (sorted && JSON.stringify(result) !== JSON.stringify([...result].sort())) {
    fail(label, "must be sorted");
  }
  return result;
}

function stringArray(label, value, options = {}) {
  return array(label, value, nonemptyString, options);
}

function verifyIdentity(label, document) {
  contentId(`${label}.id`, document.id);
  const expected = documentIdentity(document);
  if (document.id !== expected) fail(`${label}.id`, `is stale; expected ${expected}`);
}

function validateCandidateFreeze(value) {
  const label = "candidate freeze";
  exactKeys(label, value, [
    "schema", "id", "candidateCommit", "candidateTree", "sourceClosureId",
    "implementationId", "mechanismId", "parametersDigest", "buildArtifactId",
    "artifactIds", "fallbackId", "representativeObservationIds", "frozenAt",
  ]);
  if (value.schema !== FREEZE_SCHEMA) fail(`${label}.schema`, "is unsupported");
  const normalized = {
    schema: FREEZE_SCHEMA,
    id: value.id,
    candidateCommit: gitObject(`${label}.candidateCommit`, value.candidateCommit),
    candidateTree: gitObject(`${label}.candidateTree`, value.candidateTree),
    sourceClosureId: contentId(`${label}.sourceClosureId`, value.sourceClosureId),
    implementationId: contentId(`${label}.implementationId`, value.implementationId),
    mechanismId: contentId(`${label}.mechanismId`, value.mechanismId),
    parametersDigest: digest(`${label}.parametersDigest`, value.parametersDigest),
    buildArtifactId: contentId(`${label}.buildArtifactId`, value.buildArtifactId),
    artifactIds: array(`${label}.artifactIds`, value.artifactIds, contentId, {
      minimum: 1, unique: true, sorted: true,
    }),
    fallbackId: contentId(`${label}.fallbackId`, value.fallbackId),
    representativeObservationIds: array(
      `${label}.representativeObservationIds`, value.representativeObservationIds,
      contentId, { minimum: 1, unique: true, sorted: true },
    ),
    frozenAt: isoTimestamp(`${label}.frozenAt`, value.frozenAt),
  };
  if (!normalized.artifactIds.includes(normalized.buildArtifactId)) {
    fail(`${label}.artifactIds`, "must contain the frozen build artifact identity");
  }
  verifyIdentity(label, normalized);
  return deepFreeze(normalized);
}

function createCandidateFreeze(payload) {
  return validateCandidateFreeze(attachIdentity(FREEZE_SCHEMA, payload));
}

function validateOrigin(label, value, system, available) {
  exactKeys(label, value, ["kind", "adapterDigest", "resourceClass", "tool"]);
  const kind = enumeration(`${label}.kind`, value.kind, [
    "external-reference", "sagejs-current",
  ]);
  if ((system === "sagejs") !== (kind === "sagejs-current")) {
    fail(`${label}.kind`, "does not match the observed system");
  }
  const resourceClass = enumeration(`${label}.resourceClass`, value.resourceClass, [
    "four-core", "one-core",
  ]);
  exactKeys(`${label}.tool`, value.tool, [
    "status", "fingerprint", "version", "artifactDigests",
  ]);
  const toolStatus = enumeration(`${label}.tool.status`, value.tool.status, [
    "available", "unavailable",
  ]);
  if (available && toolStatus !== "available") {
    fail(`${label}.tool.status`, "an available timing requires an authenticated available tool");
  }
  const version = value.tool.version === null
    ? null : nonemptyString(`${label}.tool.version`, value.tool.version);
  if (toolStatus === "available" && version === null) {
    fail(`${label}.tool.version`, "is required for an available tool");
  }
  return {
    kind,
    adapterDigest: digest(`${label}.adapterDigest`, value.adapterDigest),
    resourceClass,
    tool: {
      status: toolStatus,
      fingerprint: digest(`${label}.tool.fingerprint`, value.tool.fingerprint),
      version,
      artifactDigests: array(
        `${label}.tool.artifactDigests`, value.tool.artifactDigests, digest,
        { minimum: available ? 1 : 0, unique: true, sorted: true },
      ),
    },
  };
}

function validateProof(label, value, system, cell, available, specifications) {
  exactKeys(label, value, ["request", "setting", "achieved", "components", "carrier"]);
  const request = enumeration(`${label}.request`, value.request, PROOF_IDS);
  const systemSpec = specifications.externalSystems.find((item) => item.id === system);
  const setting = nonemptyString(`${label}.setting`, value.setting);
  if (setting !== systemSpec.proofSettings[request]) {
    fail(`${label}.setting`, `does not match reviewed ${system} ${request} semantics`);
  }
  if (setting.includes("bnfcertify-flag-1")) {
    fail(`${label}.setting`, "bnfcertify flag 1 is not full class-group authority");
  }
  exactKeys(`${label}.carrier`, value.carrier, ["kind", "digest", "replay"]);
  const carrier = {
    kind: enumeration(`${label}.carrier.kind`, value.carrier.kind, CARRIER_KINDS),
    digest: nullableDigest(`${label}.carrier.digest`, value.carrier.digest),
    replay: enumeration(`${label}.carrier.replay`, value.carrier.replay, [
      "not-applicable", "pass", "unavailable",
    ]),
  };
  if (!available) {
    if (value.achieved !== null || value.components !== null ||
        carrier.kind !== "absent" || carrier.digest !== null ||
        carrier.replay !== "not-applicable") {
      fail(label, "an unavailable observation cannot claim achieved proof or a carrier");
    }
    return { request, setting, achieved: null, components: null, carrier };
  }
  const achieved = enumeration(`${label}.achieved`, value.achieved, PROOF_STRENGTHS);
  if (request === "unconditional" && achieved !== "exact-unconditional") {
    fail(`${label}.achieved`, "an unconditional request requires exact-unconditional");
  }
  exactKeys(`${label}.components`, value.components, [
    "classGroup", "unitGroup", "regulator",
  ]);
  const components = {
    classGroup: enumeration(
      `${label}.components.classGroup`, value.components.classGroup, PROOF_STRENGTHS,
    ),
    unitGroup: enumeration(
      `${label}.components.unitGroup`, value.components.unitGroup, PROOF_COMPONENTS,
    ),
    regulator: enumeration(
      `${label}.components.regulator`, value.components.regulator, REGULATOR_STRENGTHS,
    ),
  };
  if (components.classGroup !== achieved) {
    fail(`${label}.components.classGroup`, "must carry the achieved class-group strength");
  }
  const coupled = cell.outputContract ===
    "ordinary-class-group-units-torsion-rigorous-regulator";
  if (coupled) {
    if (components.unitGroup === "not-requested" || components.regulator === "not-requested") {
      fail(`${label}.components`, "the coupled cell requires unit and regulator semantics");
    }
    const anyConditional = components.classGroup === "exact-relations-conditional-grh" ||
      components.unitGroup === "exact-relations-conditional-grh" ||
      components.regulator === "rigorous-conditional-grh";
    if ((achieved === "exact-relations-conditional-grh") !== anyConditional) {
      fail(`${label}.achieved`, "must equal the weakest requested output component");
    }
  } else if (components.unitGroup !== "not-requested" ||
      components.regulator !== "not-requested") {
    fail(`${label}.components`, "uncoupled cells cannot silently add output proof claims");
  }
  if (!systemSpec.portableCertificate && carrier.kind === "detached-replayable") {
    fail(`${label}.carrier.kind`, `${system} has no reviewed exported portable certificate`);
  }
  if (carrier.kind === "absent" &&
      (carrier.digest !== null || carrier.replay !== "not-applicable")) {
    fail(`${label}.carrier`, "an absent carrier cannot claim a digest or replay");
  }
  if (carrier.kind === "detached-replayable" &&
      (carrier.digest === null || carrier.replay !== "pass")) {
    fail(`${label}.carrier`, "a detached carrier requires digest-bound passing replay");
  }
  if (["internal-audited", "live-authenticated"].includes(carrier.kind) &&
      (carrier.digest === null || carrier.replay !== "unavailable")) {
    fail(`${label}.carrier`, "a nonportable authenticated carrier requires a digest and unavailable replay");
  }
  if (system === "sagejs" && carrier.kind === "internal-audited") {
    fail(`${label}.carrier.kind`, "Sage.js authority is live-authenticated or detached, not an external internal audit");
  }
  if (system !== "sagejs" && carrier.kind === "live-authenticated") {
    fail(`${label}.carrier.kind`, "external proof state must not masquerade as Sage.js live authority");
  }
  if (system === "sagejs" && carrier.kind === "absent") {
    fail(`${label}.carrier.kind`, "an available Sage.js result requires authenticated proof authority");
  }
  if (system === "sagejs" && request === "unconditional" &&
      cell.id === "scalar-prepared" && carrier.kind !== "detached-replayable") {
    fail(`${label}.carrier.kind`, "the reviewed unconditional scalar route requires detached replay");
  }
  return { request, setting, achieved, components, carrier };
}

function validateBoundary(label, value, cell) {
  exactKeys(label, value, [
    "rootTiming", "phaseTotalsMayReplaceRoot", "digestInsideRoot", "preparation",
    "included", "excluded",
  ]);
  exactKeys(`${label}.preparation`, value.preparation, [
    "process", "field", "maximalOrder", "resultCache", "certificate",
  ]);
  return {
    rootTiming: enumeration(`${label}.rootTiming`, value.rootTiming, ["one-contiguous-root"]),
    phaseTotalsMayReplaceRoot: checkedBoolean(
      `${label}.phaseTotalsMayReplaceRoot`, value.phaseTotalsMayReplaceRoot,
    ),
    digestInsideRoot: checkedBoolean(`${label}.digestInsideRoot`, value.digestInsideRoot),
    preparation: {
      process: nonemptyString(`${label}.preparation.process`, value.preparation.process),
      field: nonemptyString(`${label}.preparation.field`, value.preparation.field),
      maximalOrder: nonemptyString(
        `${label}.preparation.maximalOrder`, value.preparation.maximalOrder,
      ),
      resultCache: nonemptyString(
        `${label}.preparation.resultCache`, value.preparation.resultCache,
      ),
      certificate: nonemptyString(
        `${label}.preparation.certificate`, value.preparation.certificate,
      ),
    },
    included: stringArray(`${label}.included`, value.included, { minimum: 1 }),
    excluded: stringArray(`${label}.excluded`, value.excluded),
  };
}

function validateOutput(label, value, cell, available) {
  exactKeys(label, value, [
    "contract", "relationshipToWorkload", "semanticDigest", "certificateDigest",
  ]);
  const output = {
    contract: nonemptyString(`${label}.contract`, value.contract),
    relationshipToWorkload: enumeration(
      `${label}.relationshipToWorkload`, value.relationshipToWorkload, RELATIONSHIPS,
    ),
    semanticDigest: nullableDigest(`${label}.semanticDigest`, value.semanticDigest),
    certificateDigest: nullableDigest(`${label}.certificateDigest`, value.certificateDigest),
  };
  if (available && output.semanticDigest === null) {
    fail(`${label}.semanticDigest`, "is required for an available exact result");
  }
  if (!available && (output.semanticDigest !== null || output.certificateDigest !== null)) {
    fail(label, "an unavailable observation cannot claim output digests");
  }
  if (output.relationshipToWorkload === "equal" && output.contract !== cell.outputContract) {
    fail(`${label}.contract`, "an equal output relationship requires the workload contract");
  }
  return output;
}

function validateComparability(label, value, origin, proof, output, available) {
  exactKeys(label, value, [
    "boundaryRelationship", "outputRelationship", "proofRelationship",
    "resourceRelationship", "use",
  ]);
  const result = {
    boundaryRelationship: enumeration(
      `${label}.boundaryRelationship`, value.boundaryRelationship, RELATIONSHIPS,
    ),
    outputRelationship: enumeration(
      `${label}.outputRelationship`, value.outputRelationship, RELATIONSHIPS,
    ),
    proofRelationship: enumeration(
      `${label}.proofRelationship`, value.proofRelationship, PROOF_RELATIONSHIPS,
    ),
    resourceRelationship: enumeration(
      `${label}.resourceRelationship`, value.resourceRelationship,
      ["different", "equal", "unknown"],
    ),
    use: enumeration(`${label}.use`, value.use, COMPARISON_USES),
  };
  const expectedProofRelationship = !available ? "incomparable"
    : proof.request === "conditional-grh" && proof.achieved === "exact-unconditional"
      ? "stronger" : "equal";
  if (result.proofRelationship !== expectedProofRelationship) {
    fail(`${label}.proofRelationship`, "does not follow requested versus achieved strength");
  }
  const expectedResource = origin.resourceClass === "one-core" ? "equal" : "different";
  if (available && result.resourceRelationship !== expectedResource) {
    fail(`${label}.resourceRelationship`, "does not match the one-core frontier resource class");
  }
  if (!available && result.use !== "diagnostic-only") {
    fail(`${label}.use`, "unavailable evidence is diagnostic only");
  }
  if (result.use === "exact-frontier") {
    if (result.boundaryRelationship !== "equal" || result.outputRelationship !== "equal" ||
        !["equal", "stronger"].includes(result.proofRelationship) ||
        result.resourceRelationship !== "equal" ||
        output.relationshipToWorkload !== "equal") {
      fail(`${label}.use`, "exact frontier use requires equal boundary/output/resource and nonweaker proof");
    }
  }
  if (result.use === "one-sided-lower-bound") {
    const dominates = [result.boundaryRelationship, result.outputRelationship].includes("superset") ||
      result.proofRelationship === "stronger";
    const loses = [result.boundaryRelationship, result.outputRelationship].includes("subset") ||
      result.proofRelationship === "weaker";
    if (!dominates || loses || result.resourceRelationship !== "equal") {
      fail(`${label}.use`, "one-sided use requires a nonweaker superset under equal resources");
    }
  }
  return result;
}

function validateMeasurement(label, value, protocol) {
  exactKeys(label, value, [
    "unit", "rootSamples", "batchSamples", "iterationCounts", "rootSource",
    "phaseSumUsed", "digestInsideRoot", "minimumRetainedBatchMicroseconds",
    "pairOrders", "phases", "phaseToleranceMicroseconds",
  ]);
  if (value.unit !== "microseconds") fail(`${label}.unit`, "must be microseconds");
  const rootSamples = array(`${label}.rootSamples`, value.rootSamples,
    (itemLabel, item) => finiteNumber(itemLabel, item, Number.MIN_VALUE), { minimum: 1 });
  const batchSamples = array(`${label}.batchSamples`, value.batchSamples,
    (itemLabel, item) => finiteNumber(itemLabel, item, Number.MIN_VALUE), { minimum: 1 });
  const iterationCounts = array(`${label}.iterationCounts`, value.iterationCounts,
    (itemLabel, item) => safeInteger(itemLabel, item, 1), { minimum: 1 });
  if (rootSamples.length !== batchSamples.length || rootSamples.length !== iterationCounts.length) {
    fail(label, "root, batch, and iteration arrays must have equal lengths");
  }
  const expectedRoots = protocol.pairs * 2;
  if (rootSamples.length !== expectedRoots) {
    fail(label, `must retain both raw letter roots from all ${protocol.pairs} pairs`);
  }
  const pairOrders = stringArray(`${label}.pairOrders`, value.pairOrders, {
    minimum: protocol.pairs,
  });
  if (JSON.stringify(pairOrders) !== JSON.stringify(protocol.orders)) {
    fail(`${label}.pairOrders`, "must preserve the reviewed ABBA/BAAB schedule");
  }
  const rootSource = enumeration(`${label}.rootSource`, value.rootSource, [
    "one-contiguous-monotonic-timer", "single-operation-outer-wall",
  ]);
  if (value.phaseSumUsed !== false) {
    fail(`${label}.phaseSumUsed`, "reconstructed phase totals are not root timing authority");
  }
  if (value.digestInsideRoot !== false) {
    fail(`${label}.digestInsideRoot`, "output digesting must remain outside the timed root");
  }
  const minimum = safeInteger(
    `${label}.minimumRetainedBatchMicroseconds`, value.minimumRetainedBatchMicroseconds,
  );
  const requiredMinimum = rootSource === "one-contiguous-monotonic-timer"
    ? protocol.minimumRetainedBatchMicroseconds : 0;
  if (minimum !== requiredMinimum) {
    fail(`${label}.minimumRetainedBatchMicroseconds`, "does not match the reviewed root source");
  }
  for (let index = 0; index < rootSamples.length; index += 1) {
    const expected = batchSamples[index] / iterationCounts[index];
    const tolerance = Math.max(1e-9, expected * 1e-12);
    if (Math.abs(rootSamples[index] - expected) > tolerance) {
      fail(`${label}.rootSamples[${index}]`, "must be the raw contiguous batch root per iteration");
    }
    if (batchSamples[index] < minimum) {
      fail(`${label}.batchSamples[${index}]`, "does not meet the retained root duration");
    }
  }
  const phaseToleranceMicroseconds = finiteNumber(
    `${label}.phaseToleranceMicroseconds`, value.phaseToleranceMicroseconds, 0,
  );
  const phases = array(`${label}.phases`, value.phases, (phaseLabel, phase) => {
    exactKeys(phaseLabel, phase, ["id", "samples"]);
    return {
      id: nonemptyString(`${phaseLabel}.id`, phase.id),
      samples: array(`${phaseLabel}.samples`, phase.samples,
        (sampleLabel, sample) => finiteNumber(sampleLabel, sample, 0)),
    };
  }, { minimum: 1 });
  if (new Set(phases.map((phase) => phase.id)).size !== phases.length ||
      JSON.stringify(phases.map((phase) => phase.id)) !==
        JSON.stringify(phases.map((phase) => phase.id).sort())) {
    fail(`${label}.phases`, "must have unique deterministic phase order");
  }
  if (!phases.some((phase) => phase.id === "remainder")) {
    fail(`${label}.phases`, "must retain explicit unattributed remainder");
  }
  for (const phase of phases) {
    if (phase.samples.length !== rootSamples.length) {
      fail(`${label}.phases.${phase.id}`, "must have one value per retained root");
    }
  }
  for (let index = 0; index < rootSamples.length; index += 1) {
    const attributed = phases.reduce((sum, phase) => sum + phase.samples[index], 0);
    if (Math.abs(attributed - rootSamples[index]) > phaseToleranceMicroseconds) {
      fail(`${label}.phases[${index}]`, "exclusive phases and remainder do not conserve the root");
    }
  }
  return {
    unit: "microseconds",
    rootSamples,
    batchSamples,
    iterationCounts,
    rootSource,
    phaseSumUsed: false,
    digestInsideRoot: false,
    minimumRetainedBatchMicroseconds: minimum,
    pairOrders,
    phases,
    phaseToleranceMicroseconds,
  };
}

function validateAccounting(label, value) {
  exactKeys(label, value, ["status", "counters"]);
  const status = enumeration(`${label}.status`, value.status, [
    "complete", "partial", "unavailable",
  ]);
  exactKeys(`${label}.counters`, value.counters, ACCOUNTING_IDS);
  let available = 0;
  const counters = {};
  for (const id of ACCOUNTING_IDS) {
    const counterLabel = `${label}.counters.${id}`;
    const counter = value.counters[id];
    exactKeys(counterLabel, counter, ["status", "unit", "value"]);
    const counterStatus = enumeration(`${counterLabel}.status`, counter.status, [
      "available", "not-applicable", "unavailable",
    ]);
    if (counter.unit !== ACCOUNTING_UNITS[id]) {
      fail(`${counterLabel}.unit`, `must be ${ACCOUNTING_UNITS[id]}`);
    }
    const counterValue = counter.value === null
      ? null : finiteNumber(`${counterLabel}.value`, counter.value, 0);
    if ((counterStatus === "available") !== (counterValue !== null)) {
      fail(counterLabel, "must use a numeric value exactly when available; unavailable is never zero");
    }
    if (counterStatus === "available") available += 1;
    counters[id] = { status: counterStatus, unit: counter.unit, value: counterValue };
  }
  const expected = available === ACCOUNTING_IDS.length
    ? "complete" : available === 0 ? "unavailable" : "partial";
  if (status !== expected) fail(`${label}.status`, `must be ${expected} for its counters`);
  return { status, counters };
}

function validateOracle(label, value, available, output, cell) {
  exactKeys(label, value, [
    "status", "semanticDigest", "discriminantMatched", "classNumberMatched",
    "invariantsMatched", "coupledMatched",
  ]);
  const status = enumeration(`${label}.status`, value.status, ["not-applicable", "pass"]);
  const oracle = {
    status,
    semanticDigest: nullableDigest(`${label}.semanticDigest`, value.semanticDigest),
    discriminantMatched: value.discriminantMatched,
    classNumberMatched: value.classNumberMatched,
    invariantsMatched: value.invariantsMatched,
    coupledMatched: value.coupledMatched,
  };
  if (available) {
    if (status !== "pass" || oracle.semanticDigest !== output.semanticDigest ||
        oracle.discriminantMatched !== true || oracle.classNumberMatched !== true ||
        oracle.invariantsMatched !== true) {
      fail(label, "available evidence requires exact discriminant, class number, invariants, and digest");
    }
    const coupled = cell.outputContract ===
      "ordinary-class-group-units-torsion-rigorous-regulator";
    if (coupled ? oracle.coupledMatched !== true : oracle.coupledMatched !== null) {
      fail(`${label}.coupledMatched`, "does not match the requested output contract");
    }
  } else if (status !== "not-applicable" || oracle.semanticDigest !== null ||
      oracle.discriminantMatched !== null || oracle.classNumberMatched !== null ||
      oracle.invariantsMatched !== null || oracle.coupledMatched !== null) {
    fail(label, "unavailable evidence cannot claim an oracle result");
  }
  return oracle;
}

function validateObservation(value, context = {}) {
  const label = "frontier observation";
  exactKeys(label, value, [
    "schema", "id", "authority", "promotionEligible", "workloadId", "role",
    "cell", "system", "freezeId", "availability", "origin", "proof", "boundary",
    "output", "comparability", "measurement", "accounting", "oracle", "provenance",
  ]);
  if (value.schema !== OBSERVATION_SCHEMA) fail(`${label}.schema`, "is unsupported");
  if (value.authority !== "observation-only" || value.promotionEligible !== false) {
    fail(`${label}.authority`, "external frontier evidence has no production promotion authority");
  }
  const root = repositoryRoot(context.root);
  const specifications = context.specifications || loadSpecifications(root);
  const index = context.workloadIndex || workloadIndex(root);
  const workloadId = contentId(`${label}.workloadId`, value.workloadId);
  const role = enumeration(`${label}.role`, value.role, [
    "control", "held-out", "representative",
  ]);
  const cellId = enumeration(`${label}.cell`, value.cell, CELL_IDS);
  const entry = index.get(`${cellId}:${role}`);
  if (!entry || entry.workload.id !== workloadId) {
    fail(`${label}.workloadId`, "does not identify the exact cell and corpus role");
  }
  const system = enumeration(`${label}.system`, value.system, SYSTEM_IDS);
  const freezeId = nullableContentId(`${label}.freezeId`, value.freezeId);
  exactKeys(`${label}.availability`, value.availability, ["status", "reason"]);
  const availability = {
    status: enumeration(
      `${label}.availability.status`, value.availability.status, AVAILABILITY,
    ),
    reason: value.availability.reason === null
      ? null : nonemptyString(`${label}.availability.reason`, value.availability.reason),
  };
  const available = availability.status === "available";
  if (available !== (availability.reason === null)) {
    fail(`${label}.availability.reason`, "must be null exactly when available");
  }
  const origin = validateOrigin(`${label}.origin`, value.origin, system, available);
  const proof = validateProof(
    `${label}.proof`, value.proof, system, entry.cell, available, specifications,
  );
  const boundary = validateBoundary(`${label}.boundary`, value.boundary, entry.cell);
  if (boundary.phaseTotalsMayReplaceRoot !== false || boundary.digestInsideRoot !== false) {
    fail(`${label}.boundary`, "phase sums and in-root digests are prohibited");
  }
  const output = validateOutput(`${label}.output`, value.output, entry.cell, available);
  const comparability = validateComparability(
    `${label}.comparability`, value.comparability, origin, proof, output, available,
  );
  if (comparability.outputRelationship !== output.relationshipToWorkload) {
    fail(`${label}.comparability.outputRelationship`, "must match the recorded output partial order");
  }
  if (available && system === "pari" &&
      ["fresh-complete", "group-prepared", "scalar-prepared"].includes(cellId)) {
    if (comparability.boundaryRelationship !== "superset" ||
        comparability.outputRelationship !== "superset" ||
        comparability.use !== "one-sided-lower-bound") {
      fail(`${label}.comparability`, "PARI bnfinit is a coupled superset for scalar and bare-group cells");
    }
  }
  if (available && system === "pari" && cellId === "class-unit-prepared" &&
      proof.request === "conditional-grh" && comparability.use !== "diagnostic-only") {
    fail(`${label}.comparability`, "bnfinit flag 0 may omit units and is not class-unit parity authority");
  }
  if (available && cellId === "certificate-replay" && system !== "sagejs" &&
      comparability.use !== "diagnostic-only") {
    fail(`${label}.comparability`, "systems without a portable carrier cannot claim replay parity");
  }
  if (comparability.boundaryRelationship === "equal" &&
      (JSON.stringify(boundary.preparation) !== JSON.stringify(entry.cell.preparation) ||
       JSON.stringify(boundary.included) !== JSON.stringify(entry.cell.included) ||
       JSON.stringify(boundary.excluded) !== JSON.stringify(entry.cell.excluded))) {
    fail(`${label}.boundary`, "an equal boundary relationship must equal the checked workload cell");
  }
  const measurement = value.measurement === null
    ? null : validateMeasurement(`${label}.measurement`, value.measurement, specifications.protocol);
  if (available !== (measurement !== null)) {
    fail(`${label}.measurement`, "must exist exactly for available evidence");
  }
  const accounting = validateAccounting(`${label}.accounting`, value.accounting);
  const oracle = validateOracle(
    `${label}.oracle`, value.oracle, available, output, entry.cell,
  );
  exactKeys(`${label}.provenance`, value.provenance, [
    "producerCommand", "artifactDigest", "recordedAt",
  ]);
  const provenance = {
    producerCommand: nonemptyString(
      `${label}.provenance.producerCommand`, value.provenance.producerCommand,
    ),
    artifactDigest: digest(
      `${label}.provenance.artifactDigest`, value.provenance.artifactDigest,
    ),
    recordedAt: isoTimestamp(`${label}.provenance.recordedAt`, value.provenance.recordedAt),
  };
  const freeze = context.candidateFreeze || null;
  if (role === "held-out") {
    if (!freeze || freezeId !== freeze.id) {
      fail(`${label}.freezeId`, "policy-held-out evidence requires its predecessor candidate freeze");
    }
    if (Date.parse(provenance.recordedAt) <= Date.parse(freeze.frozenAt)) {
      fail(`${label}.provenance.recordedAt`, "does not strictly follow the immutable candidate freeze");
    }
  } else if (freezeId !== null) {
    fail(`${label}.freezeId`, "non-heldout evidence must not masquerade as post-freeze evidence");
  }
  const normalized = {
    schema: OBSERVATION_SCHEMA,
    id: value.id,
    authority: "observation-only",
    promotionEligible: false,
    workloadId,
    role,
    cell: cellId,
    system,
    freezeId,
    availability,
    origin,
    proof,
    boundary,
    output,
    comparability,
    measurement,
    accounting,
    oracle,
    provenance,
  };
  verifyIdentity(label, normalized);
  return deepFreeze(normalized);
}

function createObservation(payload, context = {}) {
  return validateObservation(attachIdentity(OBSERVATION_SCHEMA, payload), context);
}

function validateClaim(label, value) {
  exactKeys(label, value, [
    "kind", "status", "promotionAuthority", "evidenceObservationIds", "reasons",
  ]);
  if (!Array.isArray(value.evidenceObservationIds) || value.kind !== "none" ||
      value.status !== "not-evaluated" || value.promotionAuthority !== false ||
      value.evidenceObservationIds.length !== 0) {
    fail(label, "this discovery contract cannot claim selection, parity, or promotion");
  }
  return {
    kind: "none",
    status: "not-evaluated",
    promotionAuthority: false,
    evidenceObservationIds: [],
    reasons: stringArray(`${label}.reasons`, value.reasons, { minimum: 1 }),
  };
}

function validateFrontierDocument(value, context = {}) {
  const label = "frontier document";
  exactKeys(label, value, [
    "schema", "id", "specificationDigest", "workloadIds", "candidateFreeze",
    "observations", "claim",
  ]);
  if (value.schema !== FRONTIER_SCHEMA) fail(`${label}.schema`, "is unsupported");
  const root = repositoryRoot(context.root);
  const specifications = loadSpecifications(root);
  const specificationDigest = sha256(fs.readFileSync(path.join(root, SPECIFICATION_PATH)));
  if (value.specificationDigest !== specificationDigest) {
    fail(`${label}.specificationDigest`, "does not bind the current checked specifications");
  }
  const workloads = cubicClassGroupWorkloads(root);
  const expectedWorkloadIds = workloads.map((workload) => workload.id).sort();
  const workloadIds = array(`${label}.workloadIds`, value.workloadIds, contentId, {
    minimum: 15, unique: true, sorted: true,
  });
  if (JSON.stringify(workloadIds) !== JSON.stringify(expectedWorkloadIds)) {
    fail(`${label}.workloadIds`, "must bind all fifteen checked workloads");
  }
  const candidateFreeze = value.candidateFreeze === null
    ? null : validateCandidateFreeze(value.candidateFreeze);
  const index = workloadIndex(root);
  const observations = array(`${label}.observations`, value.observations,
    (itemLabel, item) => validateObservation(item, {
      root, specifications, workloadIndex: index, candidateFreeze,
    }), { minimum: 1 });
  if (new Set(observations.map((observation) => observation.id)).size !== observations.length ||
      JSON.stringify(observations.map((observation) => observation.id)) !==
        JSON.stringify(observations.map((observation) => observation.id).sort())) {
    fail(`${label}.observations`, "must have unique deterministic content-ID order");
  }
  if (candidateFreeze) {
    const representativeById = new Map(observations
      .filter((observation) => observation.role === "representative")
      .map((observation) => [observation.id, observation]));
    for (const observationId of candidateFreeze.representativeObservationIds) {
      const observation = representativeById.get(observationId);
      if (!observation) {
        fail(`${label}.candidateFreeze.representativeObservationIds`,
          `${observationId} is not a checked representative observation in this document`);
      }
      if (Date.parse(observation.provenance.recordedAt) >= Date.parse(candidateFreeze.frozenAt)) {
        fail(`${label}.candidateFreeze.frozenAt`,
          "must strictly follow every representative observation it freezes");
      }
    }
  }
  const dimensions = new Set();
  for (const observation of observations) {
    const key = [observation.role, observation.cell, observation.system,
      observation.proof.request, observation.origin.resourceClass].join(":");
    if (dimensions.has(key)) fail(`${label}.observations`, `duplicate dimension ${key}`);
    dimensions.add(key);
  }
  const claim = validateClaim(`${label}.claim`, value.claim);
  const normalized = {
    schema: FRONTIER_SCHEMA,
    id: value.id,
    specificationDigest,
    workloadIds,
    candidateFreeze,
    observations,
    claim,
  };
  verifyIdentity(label, normalized);
  return deepFreeze(normalized);
}

function createFrontierDocument(payload, context = {}) {
  return validateFrontierDocument(attachIdentity(FRONTIER_SCHEMA, payload), context);
}

function evaluateCoverage(value, options = {}) {
  const document = validateFrontierDocument(value, options);
  const cell = enumeration("coverage.cell", options.cell || "scalar-prepared", CELL_IDS);
  const proof = enumeration(
    "coverage.proof", options.proof || "conditional-grh", PROOF_IDS,
  );
  const roles = options.roles || ["held-out", "representative"];
  const systems = options.systems || SYSTEM_IDS;
  const required = [];
  const missing = [];
  for (const role of roles) {
    for (const system of systems) {
      const key = `${role}:${cell}:${system}:${proof}:one-core`;
      required.push(key);
      const observation = document.observations.find((item) =>
        item.role === role && item.cell === cell && item.system === system &&
        item.proof.request === proof && item.origin.resourceClass === "one-core");
      if (!observation) {
        missing.push(`${key}:missing`);
      } else if (observation.availability.status !== "available") {
        missing.push(`${key}:${observation.availability.status}`);
      } else if (observation.comparability.use !== "exact-frontier") {
        missing.push(`${key}:${observation.comparability.use}`);
      } else if (observation.oracle.status !== "pass") {
        missing.push(`${key}:oracle-${observation.oracle.status}`);
      }
    }
  }
  return deepFreeze({
    status: missing.length === 0 ? "complete" : "coverage-incomplete",
    cell,
    proof,
    required,
    missing,
    promotionAuthority: false,
  });
}

function genericV2ProjectionBlocker(root = repositoryRoot()) {
  const blocker = loadSpecifications(root).liveSchemaExtension;
  return deepFreeze({
    status: blocker.status,
    workloadFields: [...blocker.workloadFields],
    observationFields: [...blocker.observationFields],
    promotionFields: [...blocker.promotionFields],
    reason: blocker.reason,
  });
}

function observationPlan(cellId, roleId, root = repositoryRoot()) {
  const entry = workloadIndex(root).get(`${cellId}:${roleId}`);
  if (!entry) fail("observe", `unknown cell/role ${cellId}:${roleId}`);
  return deepFreeze({
    workloadId: entry.workload.id,
    cell: entry.cell,
    role: entry.role,
    protocol: loadSpecifications(root).protocol,
    authority: "plan-only; executing a comparator requires a frozen epoch and authenticated tool receipt",
    promotionEligible: false,
  });
}

function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (command === "contracts") {
    process.stdout.write(`${JSON.stringify({
      workloads: cubicClassGroupWorkloads().length,
      blocker: genericV2ProjectionBlocker(),
    }, null, 2)}\n`);
    return;
  }
  if (command === "observe") {
    if (args.length !== 2) fail("observe", "usage: observe <cell> <role>");
    process.stdout.write(`${JSON.stringify(observationPlan(args[0], args[1]), null, 2)}\n`);
    return;
  }
  if (command === "validate") {
    if (args.length !== 1) fail("validate", "usage: validate <frontier.json>");
    const document = validateFrontierDocument(JSON.parse(fs.readFileSync(args[0], "utf8")));
    process.stdout.write(`${document.id}\n`);
    return;
  }
  if (command === "coverage") {
    if (args.length < 1 || args.length > 3) {
      fail("coverage", "usage: coverage <frontier.json> [cell proof]");
    }
    const document = JSON.parse(fs.readFileSync(args[0], "utf8"));
    process.stdout.write(`${JSON.stringify(evaluateCoverage(document, {
      cell: args[1], proof: args[2],
    }), null, 2)}\n`);
    return;
  }
  fail("command", "use contracts, observe, validate, or coverage");
}

if (require.main === module) main();

module.exports = {
  ACCOUNTING_IDS,
  ACCOUNTING_UNITS,
  AVAILABILITY,
  COMPARISON_USES,
  FREEZE_SCHEMA,
  FRONTIER_SCHEMA,
  OBSERVATION_SCHEMA,
  createCandidateFreeze,
  createFrontierDocument,
  createObservation,
  evaluateCoverage,
  genericV2ProjectionBlocker,
  main,
  observationPlan,
  validateCandidateFreeze,
  validateFrontierDocument,
  validateMeasurement,
  validateObservation,
};

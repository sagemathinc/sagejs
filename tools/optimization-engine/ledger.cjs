"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  array,
  attachIdentity,
  compareText,
  contentId,
  deepFreeze,
  digest,
  enumeration,
  exactKeys,
  nonemptyString,
  optionalString,
  repositoryPath,
  stringArray,
  verifyDocumentIdentity,
} = require("../optimizer-development/common.cjs");
const evidenceStore = require("./evidence-store.cjs");

const MEMORY_SCHEMA = "sagejs.optimization-memory-record/v2";
const CONTEXT_SCHEMA = "sagejs.optimization-memory-context/v2";
const REPORT_SCHEMA = "sagejs.optimization-memory-report/v2";
const MANIFEST_SCHEMA = "sagejs.optimization-memory-manifest/v2";
const CATEGORIES = Object.freeze([
  "algorithm", "library-route", "representation", "runtime",
  "boundary", "cache", "source", "compiler",
]);
const SUBJECT_SCOPES = Object.freeze([
  "public-call", "reviewed-phase", "source-region", "runtime-component",
  "representation-lifetime", "foreign-boundary", "cache-lifecycle",
  "algorithmic-operation",
]);
const DISPOSITIONS = Object.freeze([
  "accepted", "rejected", "investigate", "already-optimized",
  "superseded", "historical",
]);
const BINDING_STATES = Object.freeze([
  "current", "predecessor-compatible", "historical", "invalid",
]);

function fail(message) {
  throw new Error(`optimization memory: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function nullableContentId(label, value) {
  return value === null ? null : contentId(label, value);
}

function nullableDigest(label, value) {
  return value === null ? null : digest(label, value);
}

function nullableRepositoryPath(label, value) {
  return value === null ? null : repositoryPath(label, value);
}

function gitObject(label, value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    fail(`${label} must be a lowercase 40-character Git object identity`);
  }
  return value;
}

function sortedContentIds(label, value, minimum = 0) {
  return array(label, value, (itemLabel, item) => contentId(itemLabel, item), {
    minimum,
    uniqueBy: (item) => item,
    sortedBy: (item) => item,
  });
}

function validateEvidence(label, value) {
  exactKeys(label, value, [
    "id", "kind", "logicalId", "path", "uri", "sha256",
    "producerCommand", "roles", "validationStatus",
  ]);
  const checkedPath = nullableRepositoryPath(`${label}.path`, value.path);
  const uri = optionalString(`${label}.uri`, value.uri);
  if (checkedPath === null && uri === null) {
    fail(`${label} must have a checked path or immutable URI`);
  }
  return {
    id: contentId(`${label}.id`, value.id),
    kind: enumeration(`${label}.kind`, value.kind, [
      "outcome", "promotion", "performance", "oracle", "fallback",
      "resource", "negative", "legacy-receipt",
    ]),
    logicalId: nullableContentId(`${label}.logicalId`, value.logicalId),
    path: checkedPath,
    uri,
    sha256: nullableDigest(`${label}.sha256`, value.sha256),
    producerCommand: stringArray(`${label}.producerCommand`, value.producerCommand, {
      minimum: 0, sorted: false, unique: false,
    }),
    roles: stringArray(`${label}.roles`, value.roles, { minimum: 1 }),
    validationStatus: enumeration(`${label}.validationStatus`, value.validationStatus, [
      "accepted", "rejected", "unverified", "missing",
    ]),
  };
}

function validateRecord(value) {
  const label = "memory record";
  exactKeys(label, value, [
    "schema", "id", "authority", "subject", "category", "mechanism",
    "interventionId", "result", "binding", "evidence", "fallbackEvidenceIds",
    "supersedesIds",
  ]);
  if (value.schema !== MEMORY_SCHEMA) fail(`${label}.schema is unknown`);
  exactKeys(`${label}.authority`, value.authority, [
    "kind", "producer", "validatedInputIds",
  ]);
  const authority = {
    kind: enumeration(`${label}.authority.kind`, value.authority.kind, [
      "optimization-outcome-v2", "historical-v1-anchor",
    ]),
    producer: nonemptyString(`${label}.authority.producer`, value.authority.producer),
    validatedInputIds: sortedContentIds(
      `${label}.authority.validatedInputIds`, value.authority.validatedInputIds,
    ),
  };
  exactKeys(`${label}.subject`, value.subject, [
    "id", "scope", "publicOperation", "sourcePath", "regionId",
    "parentIds", "predecessorIds",
  ]);
  const subject = {
    id: contentId(`${label}.subject.id`, value.subject.id),
    scope: enumeration(`${label}.subject.scope`, value.subject.scope, SUBJECT_SCOPES),
    publicOperation: nonemptyString(
      `${label}.subject.publicOperation`, value.subject.publicOperation,
    ),
    sourcePath: repositoryPath(`${label}.subject.sourcePath`, value.subject.sourcePath),
    regionId: contentId(`${label}.subject.regionId`, value.subject.regionId),
    parentIds: sortedContentIds(`${label}.subject.parentIds`, value.subject.parentIds),
    predecessorIds: sortedContentIds(
      `${label}.subject.predecessorIds`, value.subject.predecessorIds,
    ),
  };
  const category = enumeration(`${label}.category`, value.category, CATEGORIES);
  const mechanism = nonemptyString(`${label}.mechanism`, value.mechanism);
  const interventionId = nullableContentId(`${label}.interventionId`, value.interventionId);
  exactKeys(`${label}.result`, value.result, [
    "outcomeId", "opportunityId", "campaignId", "promotionId",
    "disposition", "regressionState", "reasons",
  ]);
  const result = {
    outcomeId: nullableContentId(`${label}.result.outcomeId`, value.result.outcomeId),
    opportunityId: contentId(
      `${label}.result.opportunityId`, value.result.opportunityId,
    ),
    campaignId: nullableContentId(`${label}.result.campaignId`, value.result.campaignId),
    promotionId: nullableContentId(`${label}.result.promotionId`, value.result.promotionId),
    disposition: enumeration(
      `${label}.result.disposition`, value.result.disposition, DISPOSITIONS,
    ),
    regressionState: enumeration(
      `${label}.result.regressionState`, value.result.regressionState,
      ["current", "passing", "regressed", "not-applicable"],
    ),
    reasons: stringArray(`${label}.result.reasons`, value.result.reasons, { minimum: 1 }),
  };
  if (authority.kind === "optimization-outcome-v2" && result.outcomeId === null) {
    fail(`${label}.result.outcomeId is required for v2 outcome authority`);
  }
  if (authority.kind === "optimization-outcome-v2" &&
      !authority.validatedInputIds.includes(result.outcomeId)) {
    fail(`${label}.authority.validatedInputIds must contain the v2 outcome identity`);
  }
  if (result.disposition === "accepted" && authority.kind === "optimization-outcome-v2" &&
      (interventionId === null || result.campaignId === null || result.promotionId === null)) {
    fail(`${label}.result accepted v2 outcomes require intervention, campaign, and promotion`);
  }
  exactKeys(`${label}.binding`, value.binding, [
    "epochId", "sourceClosureId", "workloadIds", "compatibleSourceClosureIds",
    "revision",
  ]);
  exactKeys(`${label}.binding.revision`, value.binding.revision, ["commit", "tree"]);
  const binding = {
    epochId: contentId(`${label}.binding.epochId`, value.binding.epochId),
    sourceClosureId: contentId(
      `${label}.binding.sourceClosureId`, value.binding.sourceClosureId,
    ),
    workloadIds: sortedContentIds(
      `${label}.binding.workloadIds`, value.binding.workloadIds, 1,
    ),
    compatibleSourceClosureIds: sortedContentIds(
      `${label}.binding.compatibleSourceClosureIds`, value.binding.compatibleSourceClosureIds,
    ),
    revision: {
      commit: gitObject(`${label}.binding.revision.commit`, value.binding.revision.commit),
      tree: gitObject(`${label}.binding.revision.tree`, value.binding.revision.tree),
    },
  };
  const evidence = array(
    `${label}.evidence`, value.evidence, validateEvidence,
    { minimum: 1, uniqueBy: (item) => item.id, sortedBy: (item) => item.id },
  );
  const fallbackEvidenceIds = sortedContentIds(
    `${label}.fallbackEvidenceIds`, value.fallbackEvidenceIds,
    result.disposition === "accepted" ? 1 : 0,
  );
  const evidenceIds = new Set(evidence.map((item) => item.id));
  for (const evidenceId of fallbackEvidenceIds) {
    if (!evidenceIds.has(evidenceId)) {
      fail(`${label}.fallbackEvidenceIds contains unknown evidence ${evidenceId}`);
    }
  }
  const normalized = {
    schema: MEMORY_SCHEMA,
    id: value.id,
    authority,
    subject,
    category,
    mechanism,
    interventionId,
    result,
    binding,
    evidence,
    fallbackEvidenceIds,
    supersedesIds: sortedContentIds(`${label}.supersedesIds`, value.supersedesIds),
  };
  verifyDocumentIdentity(label, normalized);
  return deepFreeze(normalized);
}

function createRecord(payload) {
  return validateRecord(attachIdentity(MEMORY_SCHEMA, payload));
}

function validateContext(value) {
  const label = "memory context";
  exactKeys(label, value, [
    "schema", "id", "sourceClosureId", "workloadIds", "opportunityIds", "subjects",
  ]);
  if (value.schema !== CONTEXT_SCHEMA) fail(`${label}.schema is unknown`);
  const subjects = array(`${label}.subjects`, value.subjects, (itemLabel, item) => {
    exactKeys(itemLabel, item, ["id", "predecessorIds"]);
    return {
      id: contentId(`${itemLabel}.id`, item.id),
      predecessorIds: sortedContentIds(`${itemLabel}.predecessorIds`, item.predecessorIds),
    };
  }, { uniqueBy: (item) => item.id, sortedBy: (item) => item.id });
  const normalized = {
    schema: CONTEXT_SCHEMA,
    id: value.id,
    sourceClosureId: contentId(`${label}.sourceClosureId`, value.sourceClosureId),
    workloadIds: sortedContentIds(`${label}.workloadIds`, value.workloadIds),
    opportunityIds: sortedContentIds(`${label}.opportunityIds`, value.opportunityIds),
    subjects,
  };
  verifyDocumentIdentity(label, normalized);
  return deepFreeze(normalized);
}

function createContext(payload) {
  return validateContext(attachIdentity(CONTEXT_SCHEMA, payload));
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function loadRecords(inputs) {
  const filenames = [];
  for (const input of inputs) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(input).sort(compareText)) {
        if (name.endsWith(".json") && name !== "current-context.json" &&
            name !== "current-memory.json") {
          filenames.push(path.join(input, name));
        }
      }
    } else {
      filenames.push(input);
    }
  }
  return filenames.sort(compareText).map((filename) => validateRecord(readJson(filename)));
}

function verifyEvidence(record, repositoryRoot) {
  const problems = [];
  for (const evidence of record.evidence) {
    if (evidence.logicalId === null || evidence.sha256 === null ||
        evidence.producerCommand.length === 0) {
      problems.push(`evidence ${evidence.id} is missing producer provenance`);
    }
    if (evidence.validationStatus === "missing" || evidence.validationStatus === "unverified") {
      problems.push(`evidence ${evidence.id} is ${evidence.validationStatus}`);
    }
    if (evidence.path !== null && repositoryRoot !== null) {
      const filename = path.join(repositoryRoot, evidence.path);
      if (!fs.existsSync(filename)) {
        problems.push(`evidence ${evidence.id} checked path is missing`);
      } else if (evidence.sha256 !== null) {
        const actual = require("node:crypto").createHash("sha256")
          .update(fs.readFileSync(filename)).digest("hex");
        if (actual !== evidence.sha256) {
          problems.push(`evidence ${evidence.id} checked path digest differs`);
        }
      }
    }
  }
  for (const fallbackId of record.fallbackEvidenceIds) {
    const fallback = record.evidence.find((evidence) => evidence.id === fallbackId);
    if (fallback.validationStatus !== "accepted") {
      problems.push(`evidence ${fallbackId} fallback authority is ${fallback.validationStatus}`);
    }
  }
  return problems.sort(compareText);
}

function descendantsFor(subjectId, subjects) {
  const found = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const subject of subjects) {
      if (subject.id === subjectId || subject.predecessorIds.includes(subjectId) ||
          subject.predecessorIds.some((id) => found.has(id))) {
        if (!found.has(subject.id)) {
          found.add(subject.id);
          changed = true;
        }
      }
    }
  }
  return [...found].sort(compareText);
}

function evaluateRecord(input, inputContext, options = {}) {
  const record = validateRecord(input);
  const context = validateContext(inputContext);
  const provenanceProblems = verifyEvidence(record, options.repositoryRoot || null);
  const sourceDescendantIds = descendantsFor(record.subject.id, context.subjects);
  const workloadsPresent = record.binding.workloadIds.every(
    (workloadId) => context.workloadIds.includes(workloadId),
  );
  const opportunityPresent = context.opportunityIds.includes(record.result.opportunityId);
  let state;
  if (provenanceProblems.length > 0) {
    state = "invalid";
  } else if (record.authority.kind === "historical-v1-anchor") {
    state = "historical";
  } else if (record.binding.sourceClosureId === context.sourceClosureId &&
             workloadsPresent && opportunityPresent &&
             sourceDescendantIds.includes(record.subject.id)) {
    state = "current";
  } else if (record.binding.compatibleSourceClosureIds.includes(context.sourceClosureId) &&
             workloadsPresent && opportunityPresent && sourceDescendantIds.length > 0) {
    state = "predecessor-compatible";
  } else {
    state = "historical";
  }
  assert(BINDING_STATES.includes(state), "internal binding state is invalid");
  return deepFreeze({
    record,
    bindingState: state,
    actionable: state === "current" || state === "predecessor-compatible",
    sourceDescendantIds,
    provenanceProblems,
  });
}

function mechanismIdentity(category, key) {
  return `${category}:${key}`;
}

function linkPriorEvidence(proposal, records, context, options = {}) {
  exactKeys("memory proposal", proposal, ["subjectIds", "category", "mechanismKey"]);
  const subjectIds = sortedContentIds("memory proposal.subjectIds", proposal.subjectIds, 1);
  const identity = mechanismIdentity(
    enumeration("memory proposal.category", proposal.category, CATEGORIES),
    nonemptyString("memory proposal.mechanismKey", proposal.mechanismKey),
  );
  return records.map((record) => evaluateRecord(record, context, options))
    .filter((entry) => mechanismIdentity(
      entry.record.category, entry.record.mechanism,
    ) === identity)
    .filter((entry) => entry.record.result.disposition !== "accepted")
    .filter((entry) => subjectIds.includes(entry.record.subject.id) ||
      entry.record.subject.parentIds.some((id) => subjectIds.includes(id)) ||
      entry.sourceDescendantIds.some((id) => subjectIds.includes(id)))
    .sort((left, right) => compareText(left.record.id, right.record.id));
}

function buildReport(records, context, options = {}) {
  const entries = records.map((record) => evaluateRecord(record, context, options))
    .sort((left, right) => compareText(left.record.id, right.record.id));
  const alerts = [];
  for (const entry of entries) {
    const boundWorkloadsPresent = entry.record.binding.workloadIds.every(
      (workloadId) => context.workloadIds.includes(workloadId),
    );
    const boundSourcePresent = entry.record.binding.sourceClosureId === context.sourceClosureId ||
      entry.record.binding.compatibleSourceClosureIds.includes(context.sourceClosureId);
    if (entry.record.authority.kind !== "optimization-outcome-v2" ||
        entry.record.result.disposition !== "accepted" ||
        !boundWorkloadsPresent || !boundSourcePresent) continue;
    if (entry.sourceDescendantIds.length === 0) {
      alerts.push({ code: "accepted-subject-disappeared", recordId: entry.record.id });
    }
    if (!context.opportunityIds.includes(entry.record.result.opportunityId)) {
      alerts.push({ code: "accepted-opportunity-disappeared", recordId: entry.record.id });
    }
    const available = new Set(entry.record.evidence
      .filter((evidence) => evidence.validationStatus !== "missing")
      .map((evidence) => evidence.id));
    for (const fallbackId of entry.record.fallbackEvidenceIds) {
      if (!available.has(fallbackId) || entry.provenanceProblems.some(
        (problem) => problem.includes(`evidence ${fallbackId}`),
      )) {
        alerts.push({ code: "accepted-fallback-disappeared", recordId: entry.record.id });
      }
    }
    if (entry.record.result.regressionState === "regressed") {
      alerts.push({ code: "accepted-outcome-regressed", recordId: entry.record.id });
    }
  }
  alerts.sort((left, right) => compareText(
    `${left.code}:${left.recordId}`, `${right.code}:${right.recordId}`,
  ));
  const payload = {
    contextId: context.id,
    entries: entries.map((entry) => ({
      recordId: entry.record.id,
      authorityKind: entry.record.authority.kind,
      subjectId: entry.record.subject.id,
      sourceDescendantIds: entry.sourceDescendantIds,
      category: entry.record.category,
      mechanismKey: entry.record.mechanism,
      disposition: entry.record.result.disposition,
      regressionState: entry.record.result.regressionState,
      bindingState: entry.bindingState,
      actionable: entry.actionable,
      provenanceProblems: entry.provenanceProblems,
    })),
    alerts,
  };
  return deepFreeze(attachIdentity(REPORT_SCHEMA, payload));
}

function writeLedger(directory, records) {
  const checked = records.map(validateRecord);
  const manifest = evidenceStore.writeStore(directory, checked, { validate: false });
  return deepFreeze(attachIdentity(MANIFEST_SCHEMA, {
    logicalId: manifest.logicalId,
    recordCount: manifest.recordCount,
    assets: manifest.assets,
  }));
}

function recordsFromDatabase(filename) {
  return evidenceStore.readDatabase(filename, { validate: false }).records
    .map((entry) => validateRecord(entry.document));
}

function queryDatabase(filename, filters = {}, context = null, options = {}) {
  const records = recordsFromDatabase(filename);
  return records.map((record) => context ? evaluateRecord(record, context, options) : { record })
    .filter((entry) => !filters.category || entry.record.category === filters.category)
    .filter((entry) => !filters.mechanism || entry.record.mechanism === filters.mechanism)
    .filter((entry) => !filters.disposition ||
      entry.record.result.disposition === filters.disposition)
    .filter((entry) => !filters.bindingState || entry.bindingState === filters.bindingState)
    .map((entry) => entry.record);
}

module.exports = Object.freeze({
  BINDING_STATES,
  CONTEXT_SCHEMA,
  MANIFEST_SCHEMA,
  MEMORY_SCHEMA,
  REPORT_SCHEMA,
  SUBJECT_SCOPES,
  buildReport,
  createContext,
  createRecord,
  evaluateRecord,
  linkPriorEvidence,
  loadRecords,
  queryDatabase,
  recordsFromDatabase,
  validateContext,
  validateRecord,
  writeLedger,
});

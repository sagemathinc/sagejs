"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentIdentity,
  exactKeys,
  sha256,
} = require("../../tools/optimizer-development/common.cjs");
const {
  createDocument,
  validateWorkload,
} = require("../../tools/optimization-engine/contracts.cjs");

const SPECIFICATION_PATH =
  "architecture/optimization-engine/workloads/cubic-class-group-specifications.json";
const SPECIFICATION_SCHEMA_PATH =
  "architecture/optimization-engine/workloads/cubic-class-group-specifications.schema.json";
const FRONTIER_SCHEMA_PATH =
  "architecture/optimization-engine/workloads/cubic-class-group-frontier.schema.json";
const FIXTURE_PATH = "test/fixtures/number-field-lmfdb-cubic-100.json";

const ROLE_POLICY = Object.freeze({
  control: Object.freeze({ fixtureRole: "smoke", workloadRole: "control", count: 10 }),
  "held-out": Object.freeze({ fixtureRole: "holdout", workloadRole: "held-out", count: 30 }),
  representative: Object.freeze({ fixtureRole: "tune", workloadRole: "representative", count: 60 }),
});
const CELL_IDS = Object.freeze([
  "certificate-replay",
  "class-unit-prepared",
  "fresh-complete",
  "group-prepared",
  "scalar-prepared",
]);
const PROOF_IDS = Object.freeze(["conditional-grh", "unconditional"]);
const SYSTEM_IDS = Object.freeze(["hecke", "magma", "pari", "sagejs"]);
const PAIR_ORDERS = Object.freeze(Array.from(
  { length: 11 },
  (_, index) => index % 2 === 0 ? "ABBA" : "BAAB",
));

const PHASES = Object.freeze(Object.fromEntries(CELL_IDS.map((cell) => [
  cell,
  Object.freeze([
    Object.freeze({
      id: "complete-public",
      label: cell === "certificate-replay"
        ? "complete detached certificate replay"
        : `complete ${cell} operation`,
      parentId: null,
      timing: "inclusive",
      mayOverlap: false,
    }),
    Object.freeze({
      id: "computation",
      label: "all exact mathematical computation inside the root",
      parentId: "complete-public",
      timing: "exclusive",
      mayOverlap: false,
    }),
    Object.freeze({
      id: "proof",
      label: "proof construction, certification, or replay",
      parentId: "complete-public",
      timing: "exclusive",
      mayOverlap: false,
    }),
    Object.freeze({
      id: "publication",
      label: "requested result publication and synchronous cleanup",
      parentId: "complete-public",
      timing: "exclusive",
      mayOverlap: false,
    }),
    Object.freeze({
      id: "remainder",
      label: "unattributed time remaining inside the contiguous root",
      parentId: "complete-public",
      timing: "exclusive",
      mayOverlap: false,
    }),
  ].sort((left, right) => left.id.localeCompare(right.id))),
])));

function fail(label, message) {
  throw new Error(`cubic class-group workload ${label}: ${message}`);
}

function repositoryRoot(root = path.resolve(__dirname, "../..")) {
  return path.resolve(root);
}

function sortedUnique(label, values) {
  if (!Array.isArray(values) || values.length === 0) fail(label, "must be a nonempty list");
  const sorted = [...values].sort();
  if (JSON.stringify(values) !== JSON.stringify(sorted) || new Set(values).size !== values.length) {
    fail(label, "must be unique and sorted");
  }
  return values;
}

function loadJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function validateRole(raw) {
  exactKeys(`role ${raw?.id}`, raw, [
    "id", "workloadRole", "fixtureRole", "expectedCount", "exposure",
    "candidateFreezeRequired", "authority",
  ]);
  const expected = ROLE_POLICY[raw.id];
  if (!expected || raw.fixtureRole !== expected.fixtureRole ||
      raw.workloadRole !== expected.workloadRole || raw.expectedCount !== expected.count) {
    fail(raw.id, "does not match the frozen 10/60/30 corpus policy");
  }
  if ((raw.id === "held-out") !== raw.candidateFreezeRequired) {
    fail(raw.id, "only the policy-held-out role requires a candidate freeze");
  }
  const expectedExposure = raw.id === "held-out"
    ? "visible-policy-held-out"
    : raw.id === "control" ? "visible-control" : "visible-tuning";
  if (raw.exposure !== expectedExposure) fail(raw.id, "has a counterfeit exposure label");
  if (typeof raw.authority !== "string" || raw.authority.length === 0) {
    fail(raw.id, "requires an authority statement");
  }
  return raw;
}

function validateProof(raw) {
  exactKeys(`proof ${raw?.id}`, raw, [
    "id", "sageArgument", "allowedAchieved", "requiredClassGroupStrength",
    "strongerResultRetainsLabel",
  ]);
  if (!PROOF_IDS.includes(raw.id) || raw.strongerResultRetainsLabel !== true) {
    fail(raw.id, "has an invalid proof policy");
  }
  const unconditional = raw.id === "unconditional";
  if (raw.sageArgument !== unconditional ||
      raw.requiredClassGroupStrength !== (unconditional
        ? "exact-unconditional" : "exact-relations-conditional-grh")) {
    fail(raw.id, "does not preserve the requested proof semantics");
  }
  const expected = unconditional
    ? ["exact-unconditional"]
    : ["exact-relations-conditional-grh", "exact-unconditional"];
  if (JSON.stringify(raw.allowedAchieved) !== JSON.stringify(expected)) {
    fail(raw.id, "has an invalid achieved-proof partial order");
  }
  return raw;
}

function validateCell(raw) {
  exactKeys(`cell ${raw?.id}`, raw, [
    "id", "title", "publicEntry", "outputContract", "preparation", "rootTimer",
    "included", "excluded", "postTimerOracles",
  ]);
  if (!CELL_IDS.includes(raw.id)) fail(raw.id, "is not a reviewed measurement cell");
  if (raw.rootTimer !== "one-contiguous-root") {
    fail(raw.id, "must retain one contiguous root timer");
  }
  exactKeys(`${raw.id}.publicEntry`, raw.publicEntry, [
    "path", "name", "mode", "outputBoundary",
  ]);
  exactKeys(`${raw.id}.preparation`, raw.preparation, [
    "process", "field", "maximalOrder", "resultCache", "certificate",
  ]);
  if (raw.preparation.resultCache !== "empty" || raw.preparation.process !== "warm-sealed") {
    fail(raw.id, "must use a warm sealed process and an empty result cache");
  }
  const freshComplete = raw.id === "fresh-complete";
  if (freshComplete !== (raw.preparation.field === "constructed-inside-root") ||
      freshComplete !== (raw.preparation.maximalOrder === "constructed-inside-root")) {
    fail(raw.id, "field and maximal-order preparation disagree with the cell boundary");
  }
  if (!freshComplete && (raw.preparation.field !== "fresh-isomorphic" ||
      raw.preparation.maximalOrder !== "prepared-before-root")) {
    fail(raw.id, "prepared cells require a fresh isomorphic field and prepared maximal order");
  }
  for (const field of ["included", "postTimerOracles"]) {
    if (!Array.isArray(raw[field]) || raw[field].length === 0 ||
        raw[field].some((item) => typeof item !== "string" || item.length === 0)) {
      fail(raw.id, `${field} must be a nonempty string list`);
    }
  }
  if (!Array.isArray(raw.excluded)) fail(raw.id, "excluded must be a list");
  return raw;
}

function validateExternalSystem(raw) {
  exactKeys(`external system ${raw?.id}`, raw, [
    "id", "role", "proofSettings", "portableCertificate",
  ]);
  if (!SYSTEM_IDS.includes(raw.id)) fail(raw.id, "is not a reviewed system");
  exactKeys(`${raw.id}.proofSettings`, raw.proofSettings, PROOF_IDS);
  if (raw.id === "sagejs") {
    if (raw.role !== "production-subject" || raw.portableCertificate !== true) {
      fail(raw.id, "must remain the production subject with a portable proof surface");
    }
  } else if (raw.portableCertificate !== false) {
    fail(raw.id, "must not claim an exported portable certificate");
  }
  const forbidden = Object.values(raw.proofSettings).some((setting) =>
    setting.includes("bnfcertify-flag-1"));
  if (forbidden) fail(raw.id, "bnfcertify flag 1 is not full class-group authority");
  return raw;
}

function validateSpecifications(value, root = repositoryRoot()) {
  exactKeys("specifications", value, [
    "schema", "campaign", "owner", "normativePlan", "corpus", "roles",
    "proofContracts", "measurementCells", "protocol", "externalSystems",
    "sourcePaths", "liveSchemaExtension",
  ]);
  if (value.schema !== "sagejs.cubic-class-group-workload-specifications/v1" ||
      value.campaign !== "cubic-class-group-pari-frontier" ||
      value.owner !== "optimization-engine" ||
      value.normativePlan !== "agents/cubic-number-field-class-group-pari-frontier-plan.md") {
    fail("header", "does not identify the reviewed campaign");
  }
  exactKeys("corpus", value.corpus, [
    "path", "sha256", "schema", "recordsSha256", "labelsSha256", "selectionSqlSha256",
  ]);
  if (value.corpus.path !== FIXTURE_PATH ||
      sha256(fs.readFileSync(path.join(root, FIXTURE_PATH))) !== value.corpus.sha256) {
    fail("corpus", "does not bind the exact checked fixture bytes");
  }
  const fixture = loadJson(root, FIXTURE_PATH);
  if (fixture.schema !== value.corpus.schema ||
      fixture.checksums.records_sha256 !== value.corpus.recordsSha256 ||
      fixture.checksums.labels_sha256 !== value.corpus.labelsSha256 ||
      fixture.checksums.selection_sql_sha256 !== value.corpus.selectionSqlSha256) {
    fail("corpus", "does not bind the fixture's independent logical checksums");
  }
  if (!Array.isArray(value.roles) || value.roles.length !== 3) fail("roles", "must have 3 roles");
  value.roles.forEach(validateRole);
  sortedUnique("roles", value.roles.map((role) => role.id));
  for (const role of value.roles) {
    const actual = fixture.records.filter((record) =>
      record.selection.role === role.fixtureRole).length;
    if (actual !== role.expectedCount) fail(role.id, `expected ${role.expectedCount}, got ${actual}`);
  }
  if (!Array.isArray(value.proofContracts) || value.proofContracts.length !== 2) {
    fail("proofContracts", "must have exactly two proof policies");
  }
  value.proofContracts.forEach(validateProof);
  sortedUnique("proofContracts", value.proofContracts.map((proof) => proof.id));
  if (!Array.isArray(value.measurementCells) || value.measurementCells.length !== 5) {
    fail("measurementCells", "must contain the five distinct reviewed boundaries");
  }
  value.measurementCells.forEach(validateCell);
  if (JSON.stringify(value.measurementCells.map((cell) => cell.id)) !== JSON.stringify(CELL_IDS)) {
    fail("measurementCells", "must be unique and deterministically ordered");
  }
  exactKeys("protocol", value.protocol, [
    "warmupRuns", "pairs", "orders", "freshProcessPerLetter",
    "freshFieldPerCellProofAndRecord", "digestOutsideRoot",
    "minimumRetainedBatchMicroseconds", "minimumWorstPairFraction", "rootTiming",
    "phaseTotalsMayReplaceRoot",
  ]);
  if (value.protocol.warmupRuns !== 3 || value.protocol.pairs !== 11 ||
      JSON.stringify(value.protocol.orders) !== JSON.stringify(PAIR_ORDERS) ||
      value.protocol.freshProcessPerLetter !== true ||
      value.protocol.freshFieldPerCellProofAndRecord !== true ||
      value.protocol.digestOutsideRoot !== true ||
      value.protocol.minimumRetainedBatchMicroseconds !== 1_200_000 ||
      value.protocol.minimumWorstPairFraction !== 0.1 ||
      value.protocol.rootTiming !== "one-contiguous-root" ||
      value.protocol.phaseTotalsMayReplaceRoot !== false) {
    fail("protocol", "does not preserve the frozen 3-warmup/11-pair contiguous-root protocol");
  }
  if (!Array.isArray(value.externalSystems) || value.externalSystems.length !== 4) {
    fail("externalSystems", "must cover Sage.js, PARI, Magma, and Hecke");
  }
  value.externalSystems.forEach(validateExternalSystem);
  if (JSON.stringify(value.externalSystems.map((system) => system.id)) !==
      JSON.stringify(SYSTEM_IDS)) {
    fail("externalSystems", "must be unique and deterministically ordered");
  }
  sortedUnique("sourcePaths", value.sourcePaths);
  for (const relativePath of value.sourcePaths) {
    if (!fs.existsSync(path.join(root, relativePath))) fail("sourcePaths", `missing ${relativePath}`);
  }
  exactKeys("liveSchemaExtension", value.liveSchemaExtension, [
    "status", "workloadFields", "observationFields", "promotionFields", "reason",
  ]);
  if (value.liveSchemaExtension.status !==
      "required-before-generic-v2-projection-or-frontier-claim" ||
      JSON.stringify(value.liveSchemaExtension.workloadFields) !==
        JSON.stringify(["holdoutFreeze", "measurementBoundary", "semanticContract"]) ||
      JSON.stringify(value.liveSchemaExtension.observationFields) !==
        JSON.stringify(["availability", "comparability", "origin"]) ||
      JSON.stringify(value.liveSchemaExtension.promotionFields) !==
        JSON.stringify(["frontierClaim"])) {
    fail("liveSchemaExtension", "must surface the exact generic-v2 blocker");
  }
  return value;
}

function loadSpecifications(root = repositoryRoot()) {
  const resolved = repositoryRoot(root);
  for (const relativePath of [SPECIFICATION_SCHEMA_PATH, FRONTIER_SCHEMA_PATH]) {
    loadJson(resolved, relativePath);
  }
  return validateSpecifications(loadJson(resolved, SPECIFICATION_PATH), resolved);
}

function sourceClosure(root, specifications) {
  const records = specifications.sourcePaths.map((relativePath) => ({
    path: relativePath,
    digest: sha256(fs.readFileSync(path.join(root, relativePath))),
  }));
  return contentIdentity("sagejs.cubic-class-group-workload-source-closure/v1", records);
}

function roleRecords(fixture, role) {
  return fixture.records.filter((record) => record.selection.role === role.fixtureRole);
}

function workloadFromCell(root, specifications, fixture, closureId, role, cell) {
  const records = roleRecords(fixture, role);
  const corpusDigest = sha256(canonicalJson({
    fixtureDigest: specifications.corpus.sha256,
    fixtureRole: role.fixtureRole,
    records,
  }));
  const boundaryDigest = sha256(canonicalJson({ cell, protocol: specifications.protocol }));
  const proofDigest = sha256(canonicalJson(specifications.proofContracts));
  return validateWorkload(createDocument("workload", {
    authority: {
      kind: "reviewed-contract",
      producer: "optimization.cubic-class-group-workloads.v1",
      validatedInputIds: [closureId],
    },
    sourceClosureId: closureId,
    title: `${cell.title} — ${role.id}`,
    owner: specifications.owner,
    role: role.workloadRole,
    publicEntry: cell.publicEntry,
    runner: {
      path: "bench/optimization-engine/cubic-class-group-frontier.cjs",
      argv: ["observe", cell.id, role.id],
      environment: [
        "SAGEJS_CUBIC_FRONTIER_EPOCH",
        "SAGEJS_CUBIC_FRONTIER_EVIDENCE",
        "SAGEJS_CUBIC_FRONTIER_FREEZE",
        "SAGEJS_OPT_LEVEL",
      ],
    },
    corpus: {
      id: `cubic-lmfdb-${role.fixtureRole}-${role.expectedCount}`,
      digest: corpusDigest,
      provenance: `${role.authority}; exact fixture ${specifications.corpus.sha256}`,
    },
    oracles: [
      {
        id: "measurement-boundary-contract",
        kind: "invariant",
        digest: boundaryDigest,
        provenance: "Reviewed one-contiguous-root boundary, inclusions, exclusions, and post-timer oracles",
      },
      {
        id: "pinned-lmfdb-cubic-results",
        kind: "digest",
        digest: specifications.corpus.recordsSha256,
        provenance: "Pinned LMFDB discriminants, ordinary class numbers, and invariant factors",
      },
      {
        id: "proof-strength-contract",
        kind: "invariant",
        digest: proofDigest,
        provenance: "Requested and achieved proof strengths remain distinct and stronger results retain their labels",
      },
    ].sort((left, right) => left.id.localeCompare(right.id)),
    phases: PHASES[cell.id],
    protocol: {
      warmupRuns: specifications.protocol.warmupRuns,
      repetitions: specifications.protocol.pairs,
      timeoutMilliseconds: 1_800_000,
      reset: "process",
      preparation: "warm-prepared-sealed",
    },
    platforms: ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"],
    browsers: [],
    instrumentation: [
      "allocation-counter",
      "boundary-counter",
      "inclusive-timer",
      "proof-carrier",
      "resource-lifetime",
    ],
    materiality: {
      minimumWorstPairFraction: specifications.protocol.minimumWorstPairFraction,
      minimumPairs: specifications.protocol.pairs,
    },
  }));
}

function cubicClassGroupWorkloads(root = repositoryRoot()) {
  const resolved = repositoryRoot(root);
  const specifications = loadSpecifications(resolved);
  const fixture = loadJson(resolved, FIXTURE_PATH);
  const closureId = sourceClosure(resolved, specifications);
  const workloads = [];
  for (const cell of specifications.measurementCells) {
    for (const role of specifications.roles) {
      workloads.push(workloadFromCell(
        resolved, specifications, fixture, closureId, role, cell,
      ));
    }
  }
  if (workloads.length !== 15 || new Set(workloads.map((workload) => workload.id)).size !== 15) {
    fail("catalog", "must contain five cells across exactly three corpus roles");
  }
  return Object.freeze(workloads);
}

function workloadIndex(root = repositoryRoot()) {
  const specifications = loadSpecifications(root);
  const workloads = cubicClassGroupWorkloads(root);
  const index = new Map();
  let offset = 0;
  for (const cell of specifications.measurementCells) {
    for (const role of specifications.roles) {
      const key = `${cell.id}:${role.id}`;
      index.set(key, Object.freeze({ key, cell, role, workload: workloads[offset++] }));
    }
  }
  return index;
}

module.exports = {
  CELL_IDS,
  FIXTURE_PATH,
  FRONTIER_SCHEMA_PATH,
  PAIR_ORDERS,
  PHASES,
  PROOF_IDS,
  ROLE_POLICY,
  SPECIFICATION_PATH,
  SPECIFICATION_SCHEMA_PATH,
  SYSTEM_IDS,
  cubicClassGroupWorkloads,
  loadSpecifications,
  repositoryRoot,
  validateSpecifications,
  workloadIndex,
};

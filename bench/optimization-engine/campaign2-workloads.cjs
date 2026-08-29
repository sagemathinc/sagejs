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
  "architecture/optimization-engine/workloads/campaign2-specifications.json";

const PHASES = Object.freeze({
  "cubic-factorization": Object.freeze([
    Object.freeze({
      id: "complete-public", label: "complete public class-number call",
      parentId: null, timing: "inclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "factor-production", label: "cubic modular factor production",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "foreign-conversion", label: "foreign payload conversion and validation",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "presentation", label: "class-group proof and presentation construction",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "remainder", label: "all other work inside the public call",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
  ]),
  "dense-integral": Object.freeze([
    Object.freeze({
      id: "block-placement", label: "block placement into the public output buffer",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "complete-public", label: "complete public polynomial integral call",
      parentId: null, timing: "inclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "foreign-calls", label: "all FLINT calls including boundary overhead",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "preflight", label: "characteristic-hole and capability preflight",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "result-construction", label: "trim and public polynomial construction",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
  ]),
  "hyperelliptic-normalization": Object.freeze([
    Object.freeze({
      id: "certificate-construction", label: "Euler-factor and certificate reconstruction",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "complete-public", label: "complete public local-reduction call",
      parentId: null, timing: "inclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "normalization-transform", label: "exact elliptic normalization transformation",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "remainder", label: "all other work inside the public call",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
    Object.freeze({
      id: "smalljac-call", label: "smalljac call including conversion and boundary overhead",
      parentId: "complete-public", timing: "exclusive", mayOverlap: false,
    }),
  ]),
});

function fail(label, message) {
  throw new Error(`Campaign 2 workload ${label}: ${message}`);
}

function repositoryRoot(root = path.resolve(__dirname, "../..")) {
  return path.resolve(root);
}

function loadSpecifications(root) {
  const filename = path.join(repositoryRoot(root), SPECIFICATION_PATH);
  const value = JSON.parse(fs.readFileSync(filename, "utf8"));
  exactKeys("Campaign 2 specifications", value, ["schema", "campaign", "owner", "subjects"]);
  if (value.schema !== "sagejs.optimization-campaign-workload-specifications/v1") {
    fail("schema", `unknown schema ${value.schema}`);
  }
  if (value.campaign !== "mature-capability-routing-calibration") {
    fail("campaign", `unknown campaign ${value.campaign}`);
  }
  if (value.owner !== "optimization-engine") fail("owner", "must be optimization-engine");
  if (!Array.isArray(value.subjects) || value.subjects.length !== 6) {
    fail("subjects", "must contain exactly three representative/held-out pairs");
  }
  const keys = value.subjects.map((subject) => subject.key);
  const sorted = [...keys].sort();
  if (JSON.stringify(keys) !== JSON.stringify(sorted) || new Set(keys).size !== keys.length) {
    fail("subjects", "must use unique deterministic key order");
  }
  return value;
}

function sourceClosure(root, subject) {
  const records = subject.sourcePaths.map((relativePath) => {
    const filename = path.join(root, relativePath);
    if (!fs.existsSync(filename)) fail(subject.key, `missing source ${relativePath}`);
    return { path: relativePath, digest: sha256(fs.readFileSync(filename)) };
  });
  const sorted = [...records].sort((left, right) => left.path.localeCompare(right.path));
  if (JSON.stringify(records) !== JSON.stringify(sorted)) {
    fail(subject.key, "source paths must be sorted");
  }
  return contentIdentity("sagejs.optimization-workload-source-closure/v1", records);
}

function workloadFromSpecification(root, owner, subject) {
  exactKeys(`Campaign 2 specification ${subject.key}`, subject, [
    "key", "family", "role", "title", "publicEntry", "sourcePaths", "corpus",
    "oracles", "protocol", "platforms", "browsers", "instrumentation", "costBoundary",
  ]);
  if (!PHASES[subject.family]) fail(subject.key, `unknown family ${subject.family}`);
  if (!new Set(["representative", "held-out"]).has(subject.role)) {
    fail(subject.key, `invalid role ${subject.role}`);
  }
  const closureId = sourceClosure(root, subject);
  const corpusDigest = sha256(canonicalJson({
    id: subject.corpus.id,
    provenance: subject.corpus.provenance,
    definition: subject.corpus.definition,
  }));
  const oracles = subject.oracles.map((oracle) => ({
    id: oracle.id,
    kind: oracle.kind,
    digest: sha256(canonicalJson({
      family: subject.family,
      corpusDigest,
      id: oracle.id,
      kind: oracle.kind,
      provenance: oracle.provenance,
    })),
    provenance: oracle.provenance,
  })).sort((left, right) => left.id.localeCompare(right.id));
  return createDocument("workload", {
    authority: {
      kind: "reviewed-contract",
      producer: "optimization.campaign2-workloads.v2",
      validatedInputIds: [closureId],
    },
    sourceClosureId: closureId,
    title: subject.title,
    owner,
    role: subject.role,
    publicEntry: subject.publicEntry,
    runner: {
      path: "bench/optimization-engine/campaign2-discovery.cjs",
      argv: ["measure", subject.key],
      environment: [
        "SAGEJS_CAMPAIGN2_EPOCH",
        "SAGEJS_CAMPAIGN2_EVIDENCE",
        "SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY",
        "SAGEJS_NATIVE_DISABLE",
        "SAGEJS_OPT_LEVEL",
      ],
    },
    corpus: {
      id: subject.corpus.id,
      digest: corpusDigest,
      provenance: subject.corpus.provenance,
    },
    oracles,
    phases: PHASES[subject.family],
    protocol: {
      ...subject.protocol,
      reset: "process",
      preparation: "warm-prepared-sealed",
    },
    platforms: subject.platforms,
    browsers: subject.browsers,
    instrumentation: subject.instrumentation,
    materiality: { minimumWorstPairFraction: 0.1, minimumPairs: 11 },
  });
}

function campaign2Workloads(root) {
  const resolvedRoot = repositoryRoot(root);
  const specifications = loadSpecifications(resolvedRoot);
  const workloads = specifications.subjects.map((subject) =>
    workloadFromSpecification(resolvedRoot, specifications.owner, subject));
  for (const workload of workloads) validateWorkload(workload);
  const families = new Map();
  for (let index = 0; index < specifications.subjects.length; index += 1) {
    const subject = specifications.subjects[index];
    const roles = families.get(subject.family) || new Set();
    roles.add(workloads[index].role);
    families.set(subject.family, roles);
  }
  if (families.size !== 3 || [...families.values()].some((roles) =>
    !roles.has("representative") || !roles.has("held-out") || roles.size !== 2)) {
    fail("subjects", "each family must have exactly representative and held-out roles");
  }
  return Object.freeze(workloads);
}

function workloadIndex(root) {
  const specifications = loadSpecifications(root);
  const workloads = campaign2Workloads(root);
  return new Map(specifications.subjects.map((subject, index) => [subject.key, {
    specification: subject,
    workload: workloads[index],
  }]));
}

module.exports = Object.freeze({
  PHASES,
  SPECIFICATION_PATH,
  campaign2Workloads,
  loadSpecifications,
  workloadIndex,
});

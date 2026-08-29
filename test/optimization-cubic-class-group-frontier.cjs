// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { sha256 } = require("../tools/optimizer-development/common.cjs");
const {
  ACCOUNTING_IDS,
  ACCOUNTING_UNITS,
  createCandidateFreeze,
  createFrontierDocument,
  createObservation,
  evaluateCoverage,
  genericV2ProjectionBlocker,
} = require("../bench/optimization-engine/cubic-class-group-frontier.cjs");
const {
  CELL_IDS,
  PAIR_ORDERS,
  SYSTEM_IDS,
  cubicClassGroupWorkloads,
  loadSpecifications,
  workloadIndex,
} = require("../bench/optimization-engine/cubic-class-group-workloads.cjs");

const root = path.resolve(__dirname, "..");
const digest = (label) => sha256(label);
const id = (label) => `sha256:${digest(label)}`;
const commit = (character) => character.repeat(40);
const SPEC_PATH = path.join(
  root, "architecture/optimization-engine/workloads/cubic-class-group-specifications.json",
);
const FRONTIER_SCHEMA_PATH = path.join(
  root, "architecture/optimization-engine/workloads/cubic-class-group-frontier.schema.json",
);
const SPEC_SCHEMA_PATH = path.join(
  root, "architecture/optimization-engine/workloads/cubic-class-group-specifications.schema.json",
);
const BASE_TIME = "2026-08-29T12:00:00.000Z";
const FREEZE_TIME = "2026-08-29T13:00:00.000Z";
const HELDOUT_TIME = "2026-08-29T14:00:00.000Z";

function settings(system, request) {
  return loadSpecifications(root).externalSystems.find((item) => item.id === system)
    .proofSettings[request];
}

function accounting(status = "complete") {
  const counters = {};
  for (const [index, name] of ACCOUNTING_IDS.entries()) {
    counters[name] = {
      status: status === "complete" ? "available" : "unavailable",
      unit: ACCOUNTING_UNITS[name],
      value: status === "complete" ? index + 1 : null,
    };
  }
  return { status, counters };
}

function measurement() {
  const count = PAIR_ORDERS.length * 2;
  return {
    unit: "microseconds",
    rootSamples: Array(count).fill(600_000),
    batchSamples: Array(count).fill(1_200_000),
    iterationCounts: Array(count).fill(2),
    rootSource: "one-contiguous-monotonic-timer",
    phaseSumUsed: false,
    digestInsideRoot: false,
    minimumRetainedBatchMicroseconds: 1_200_000,
    pairOrders: [...PAIR_ORDERS],
    phases: [
      { id: "computation", samples: Array(count).fill(200_000) },
      { id: "proof", samples: Array(count).fill(150_000) },
      { id: "publication", samples: Array(count).fill(100_000) },
      { id: "remainder", samples: Array(count).fill(150_000) },
    ],
    phaseToleranceMicroseconds: 0,
  };
}

function proofComponents(cell, achieved, system) {
  if (cell !== "class-unit-prepared") {
    return {
      classGroup: achieved,
      unitGroup: "not-requested",
      regulator: "not-requested",
    };
  }
  if (achieved === "exact-unconditional" || system === "magma") {
    return {
      classGroup: achieved,
      unitGroup: "exact-unconditional",
      regulator: "rigorous-unconditional",
    };
  }
  return {
    classGroup: achieved,
    unitGroup: "exact-relations-conditional-grh",
    regulator: "rigorous-conditional-grh",
  };
}

function carrier(system, request, cell) {
  if (system === "sagejs" && request === "unconditional" &&
      cell === "scalar-prepared") {
    return { kind: "detached-replayable", digest: digest("detached-carrier"), replay: "pass" };
  }
  if (system === "sagejs") {
    return { kind: "live-authenticated", digest: digest("live-carrier"), replay: "unavailable" };
  }
  if (request === "unconditional") {
    return { kind: "internal-audited", digest: digest(`${system}-proof-state`), replay: "unavailable" };
  }
  return { kind: "absent", digest: null, replay: "not-applicable" };
}

function relationship(system, request, cell) {
  if (system === "pari" &&
      ["fresh-complete", "group-prepared", "scalar-prepared"].includes(cell)) {
    return {
      boundary: "superset",
      output: "superset",
      use: "one-sided-lower-bound",
      contract: "pari-coupled-bnf-state",
    };
  }
  if (system === "pari" && cell === "class-unit-prepared" &&
      request === "conditional-grh") {
    return {
      boundary: "equal",
      output: "subset",
      use: "diagnostic-only",
      contract: "pari-bnf-with-possibly-omitted-units",
    };
  }
  if (system !== "sagejs" && cell === "certificate-replay") {
    return {
      boundary: "incomparable",
      output: "incomparable",
      use: "diagnostic-only",
      contract: `${system}-internal-proof-state`,
    };
  }
  return { boundary: "equal", output: "equal", use: "exact-frontier", contract: null };
}

function observationPayload(options = {}) {
  const system = options.system || "sagejs";
  const role = options.role || "representative";
  const cell = options.cell || "scalar-prepared";
  const request = options.request || "conditional-grh";
  const available = options.available !== false;
  const entry = workloadIndex(root).get(`${cell}:${role}`);
  const relation = relationship(system, request, cell);
  const achieved = request === "unconditional"
    ? "exact-unconditional" : "exact-relations-conditional-grh";
  const semanticDigest = digest(`${system}:${role}:${cell}:${request}:semantic`);
  const freeze = options.freeze || null;
  if (!available) {
    return {
      authority: "observation-only",
      promotionEligible: false,
      workloadId: entry.workload.id,
      role,
      cell,
      system,
      freezeId: role === "held-out" ? freeze?.id || null : null,
      availability: { status: options.availability || "unavailable", reason: "tool unavailable" },
      origin: {
        kind: system === "sagejs" ? "sagejs-current" : "external-reference",
        adapterDigest: digest(`${system}-adapter`),
        resourceClass: "one-core",
        tool: {
          status: "unavailable", fingerprint: digest(`${system}-fingerprint`),
          version: null, artifactDigests: [],
        },
      },
      proof: {
        request, setting: settings(system, request), achieved: null, components: null,
        carrier: { kind: "absent", digest: null, replay: "not-applicable" },
      },
      boundary: {
        rootTiming: "one-contiguous-root", phaseTotalsMayReplaceRoot: false,
        digestInsideRoot: false, preparation: { ...entry.cell.preparation },
        included: [...entry.cell.included], excluded: [...entry.cell.excluded],
      },
      output: {
        contract: entry.cell.outputContract, relationshipToWorkload: "incomparable",
        semanticDigest: null, certificateDigest: null,
      },
      comparability: {
        boundaryRelationship: "incomparable", outputRelationship: "incomparable",
        proofRelationship: "incomparable", resourceRelationship: "unknown",
        use: "diagnostic-only",
      },
      measurement: null,
      accounting: accounting("unavailable"),
      oracle: {
        status: "not-applicable", semanticDigest: null, discriminantMatched: null,
        classNumberMatched: null, invariantsMatched: null, coupledMatched: null,
      },
      provenance: {
        producerCommand: `fixture ${system}`, artifactDigest: digest(`${system}-receipt`),
        recordedAt: options.recordedAt || (role === "held-out" ? HELDOUT_TIME : BASE_TIME),
      },
    };
  }
  const outputContract = relation.contract || entry.cell.outputContract;
  return {
    authority: "observation-only",
    promotionEligible: false,
    workloadId: entry.workload.id,
    role,
    cell,
    system,
    freezeId: role === "held-out" ? freeze?.id || null : null,
    availability: { status: "available", reason: null },
    origin: {
      kind: system === "sagejs" ? "sagejs-current" : "external-reference",
      adapterDigest: digest(`${system}-adapter`),
      resourceClass: "one-core",
      tool: {
        status: "available", fingerprint: digest(`${system}-fingerprint`),
        version: `${system}-test`, artifactDigests: [digest(`${system}-artifact`)],
      },
    },
    proof: {
      request,
      setting: settings(system, request),
      achieved,
      components: proofComponents(cell, achieved, system),
      carrier: carrier(system, request, cell),
    },
    boundary: {
      rootTiming: "one-contiguous-root",
      phaseTotalsMayReplaceRoot: false,
      digestInsideRoot: false,
      preparation: { ...entry.cell.preparation },
      included: [...entry.cell.included],
      excluded: [...entry.cell.excluded],
    },
    output: {
      contract: outputContract,
      relationshipToWorkload: relation.output,
      semanticDigest,
      certificateDigest: system === "sagejs" ? digest(`${system}-certificate`) : null,
    },
    comparability: {
      boundaryRelationship: relation.boundary,
      outputRelationship: relation.output,
      proofRelationship: "equal",
      resourceRelationship: "equal",
      use: relation.use,
    },
    measurement: measurement(),
    accounting: accounting(),
    oracle: {
      status: "pass",
      semanticDigest,
      discriminantMatched: true,
      classNumberMatched: true,
      invariantsMatched: true,
      coupledMatched: cell === "class-unit-prepared" ? true : null,
    },
    provenance: {
      producerCommand: `fixture ${system}`,
      artifactDigest: digest(`${system}-receipt`),
      recordedAt: options.recordedAt || (role === "held-out" ? HELDOUT_TIME : BASE_TIME),
    },
  };
}

function freeze(representativeObservationIds) {
  return createCandidateFreeze({
    candidateCommit: commit("1"),
    candidateTree: commit("2"),
    sourceClosureId: id("source-closure"),
    implementationId: id("implementation"),
    mechanismId: id("mechanism"),
    parametersDigest: digest("parameters"),
    buildArtifactId: id("build-artifact"),
    artifactIds: [id("build-artifact"), id("fallback-artifact")].sort(),
    fallbackId: id("fallback"),
    representativeObservationIds: [...representativeObservationIds].sort(),
    frozenAt: FREEZE_TIME,
  });
}

function frontier(observations, candidateFreeze = null) {
  return createFrontierDocument({
    specificationDigest: sha256(fs.readFileSync(SPEC_PATH)),
    workloadIds: cubicClassGroupWorkloads(root).map((item) => item.id).sort(),
    candidateFreeze,
    observations: [...observations].sort((left, right) => left.id.localeCompare(right.id)),
    claim: {
      kind: "none", status: "not-evaluated", promotionAuthority: false,
      evidenceObservationIds: [],
      reasons: ["Frontier observations are discovery evidence, never production promotion authority."],
    },
  }, { root });
}

test("the checked workload layer binds five boundaries across the exact 10/60/30 corpus", () => {
  const specifications = loadSpecifications(root);
  const workloads = cubicClassGroupWorkloads(root);
  assert.equal(workloads.length, 15);
  assert.equal(new Set(workloads.map((item) => item.id)).size, 15);
  assert.deepEqual(specifications.measurementCells.map((item) => item.id), [...CELL_IDS]);
  assert.deepEqual(specifications.roles.map((item) => [item.id, item.expectedCount]), [
    ["control", 10], ["held-out", 30], ["representative", 60],
  ]);
  assert.deepEqual(specifications.protocol.orders, [...PAIR_ORDERS]);
  assert.equal(specifications.protocol.phaseTotalsMayReplaceRoot, false);
  assert.equal(JSON.parse(fs.readFileSync(SPEC_SCHEMA_PATH)).properties.protocol
    .properties.pairs.const, 11);
  assert.equal(JSON.parse(fs.readFileSync(FRONTIER_SCHEMA_PATH)).properties.claim
    .properties.promotionAuthority.const, false);
  assert.deepEqual(genericV2ProjectionBlocker(root), specifications.liveSchemaExtension);
});

test("frontier observations preserve exact roots, proof authority, accounting, and no promotion", () => {
  const observation = createObservation(observationPayload(), { root });
  const document = frontier([observation]);
  assert.equal(document.observations[0].measurement.rootSamples.length, 22);
  assert.equal(document.observations[0].accounting.status, "complete");
  assert.equal(document.observations[0].authority, "observation-only");
  assert.equal(document.claim.promotionAuthority, false);
  assert.equal(document.id.startsWith("sha256:"), true);
});

test("counterfeit reconstructed phase totals and incomplete pair protocols fail closed", () => {
  const reconstructed = observationPayload();
  reconstructed.measurement.phaseSumUsed = true;
  assert.throws(() => createObservation(reconstructed, { root }), /reconstructed phase totals/);

  const truncated = observationPayload();
  for (const key of ["rootSamples", "batchSamples", "iterationCounts", "pairOrders"]) {
    truncated.measurement[key].pop();
  }
  for (const phase of truncated.measurement.phases) phase.samples.pop();
  assert.throws(() => createObservation(truncated, { root }), /both raw letter roots/);
});

test("counterfeit proof labels and proof settings cannot manufacture exact authority", () => {
  const weakened = observationPayload({ request: "unconditional" });
  weakened.proof.achieved = "exact-relations-conditional-grh";
  weakened.proof.components.classGroup = "exact-relations-conditional-grh";
  assert.throws(() => createObservation(weakened, { root }), /requires exact-unconditional/);

  const relabeled = observationPayload();
  relabeled.proof.achieved = "exact-unconditional";
  relabeled.proof.components.classGroup = "exact-unconditional";
  assert.throws(() => createObservation(relabeled, { root }), /requested versus achieved strength/);

  const pariFlagOne = observationPayload({ system: "pari", request: "unconditional" });
  pariFlagOne.proof.setting = "bnfinit-nf-flag-1-plus-bnfcertify-flag-1";
  assert.throws(() => createObservation(pariFlagOne, { root }), /does not match reviewed pari/);
});

test("unavailable comparators cannot carry timings, outputs, or zero-valued fake counters", () => {
  const timedUnavailable = observationPayload({ system: "hecke", available: false });
  timedUnavailable.measurement = measurement();
  assert.throws(() => createObservation(timedUnavailable, { root }), /must exist exactly/);

  const zeroUnavailable = observationPayload({ system: "magma", available: false });
  zeroUnavailable.accounting.counters.nativeCrossings.value = 0;
  assert.throws(() => createObservation(zeroUnavailable, { root }), /unavailable is never zero/);
});

test("output and boundary partial orders prevent counterfeit parity", () => {
  const pariScalar = observationPayload({ system: "pari" });
  pariScalar.output.contract = "ordinary-class-number";
  pariScalar.output.relationshipToWorkload = "equal";
  pariScalar.comparability.boundaryRelationship = "equal";
  pariScalar.comparability.outputRelationship = "equal";
  pariScalar.comparability.use = "exact-frontier";
  assert.throws(() => createObservation(pariScalar, { root }), /bnfinit is a coupled superset/);

  const changedBoundary = observationPayload();
  changedBoundary.boundary.preparation.maximalOrder = "constructed-inside-root";
  assert.throws(() => createObservation(changedBoundary, { root }), /equal boundary relationship/);

  const mismatchedOutput = observationPayload();
  mismatchedOutput.output.relationshipToWorkload = "superset";
  assert.throws(() => createObservation(mismatchedOutput, { root }),
    /exact frontier use|must match the recorded output/);
});

test("comparator coverage requires every exact representative and post-freeze heldout cell", () => {
  const representative = SYSTEM_IDS.map((system) => createObservation(observationPayload({
    system, role: "representative", cell: "class-unit-prepared", request: "unconditional",
  }), { root }));
  const candidateFreeze = freeze(representative.map((item) => item.id));
  const heldout = SYSTEM_IDS.map((system) => createObservation(observationPayload({
    system, role: "held-out", cell: "class-unit-prepared", request: "unconditional",
    freeze: candidateFreeze,
  }), { root, candidateFreeze }));
  const complete = frontier([...representative, ...heldout], candidateFreeze);
  assert.deepEqual(evaluateCoverage(complete, {
    root, cell: "class-unit-prepared", proof: "unconditional",
  }), {
    status: "complete",
    cell: "class-unit-prepared",
    proof: "unconditional",
    required: [
      "held-out:class-unit-prepared:hecke:unconditional:one-core",
      "held-out:class-unit-prepared:magma:unconditional:one-core",
      "held-out:class-unit-prepared:pari:unconditional:one-core",
      "held-out:class-unit-prepared:sagejs:unconditional:one-core",
      "representative:class-unit-prepared:hecke:unconditional:one-core",
      "representative:class-unit-prepared:magma:unconditional:one-core",
      "representative:class-unit-prepared:pari:unconditional:one-core",
      "representative:class-unit-prepared:sagejs:unconditional:one-core"
    ],
    missing: [],
    promotionAuthority: false,
  });

  const withoutHeckeHeldout = frontier([
    ...representative, ...heldout.filter((item) => item.system !== "hecke"),
  ], candidateFreeze);
  const incomplete = evaluateCoverage(withoutHeckeHeldout, {
    root, cell: "class-unit-prepared", proof: "unconditional",
  });
  assert.equal(incomplete.status, "coverage-incomplete");
  assert.deepEqual(incomplete.missing, [
    "held-out:class-unit-prepared:hecke:unconditional:one-core:missing",
  ]);
});

test("policy-heldout evidence must descend from an immutable predecessor freeze", () => {
  const representative = createObservation(observationPayload(), { root });
  const candidateFreeze = freeze([representative.id]);
  const premature = observationPayload({
    role: "held-out", freeze: candidateFreeze, recordedAt: BASE_TIME,
  });
  assert.throws(() => createObservation(premature, { root, candidateFreeze }), /strictly follow/);

  const unfrozen = observationPayload({ role: "held-out" });
  assert.throws(() => createObservation(unfrozen, { root }), /predecessor candidate freeze/);
});

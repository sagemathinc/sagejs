"use strict";

// Static, field-neutral inventory and fail-closed admission gate for Phase-6
// prepared-kernel adapter pairs.  Merely exposing two modules and a shared
// metadata projection is diagnostic information, not matched-output evidence.
// A row is admitted only by a row-specific v2 evidence verifier.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const worker = require("./qualification_arm_worker.cjs");

const REGISTRY_SCHEMA =
  "sagejs.pari-class-group/phase6-prepared-adapter-registry-v2";
const REGISTRATION_SCHEMA =
  "sagejs.pari-class-group/phase6-prepared-adapter-registration-v2";
const CAPABILITY_SCHEMA =
  "sagejs.pari-class-group/phase6-matched-state-admission-capability-v2";
const WRAPPER_PATH = path.join(__dirname,
  "phase6_registered_prepared_adapter.cjs");
const FACTORY = "createRegisteredPreparedAdapter";

const REQUIRED_CAPABILITIES = Object.freeze([
  "row-specific-evidence-verifier",
  "class-invariants",
  "class-generator-ideals-orders-principal-witnesses",
  "unit-compact-or-factored-basis-or-exact-not-given",
  "regulator-value-and-log-lattice-semantics",
  "torsion",
  "terminal-precision-retry-state",
  "independent-replay-distinct-from-output",
  "replay-mutation-coverage",
  "independently-observed-work-counters",
  "independently-observed-native-call-counters",
  "source-and-provenance-hashes",
]);

const COVERAGE_KEYS = Object.freeze(REQUIRED_CAPABILITIES.slice(1));
const MUTATION_FAMILIES = Object.freeze([
  "class-invariants", "class-generators", "class-principal-witnesses",
  "unit-basis", "regulator-log-lattice", "torsion", "terminal-state",
  "precision-state", "retry-state", "replay-authority", "work-counters",
  "native-calls", "source-provenance",
]);
const SHA256 = /^[0-9a-f]{64}$/;

const exactKeys = (value, keys, label) => {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(),
    `${label} has unexpected fields`);
};

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// This is the sole production trust root for v2 admission. Entries must be
// reviewed and committed here; callers cannot inject an alternate authority.
// It is intentionally empty until the first complete row-specific evidence
// bundle and sample contract have been reviewed.
const TRUSTED_V2_ADMISSIONS = deepFreeze([]);

const commonCubic = ({ row, id, polynomial, classNumber, invariants }) => ({
  schema: `sagejs.pari-class-group/row${row}-phase6-common-projection-v1`,
  field: { id, polynomialAscending: polynomial },
  classGroup: { classNumber, invariantFactors: invariants },
  unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
  work: { degree: "3", logRows: "3", logColumns: "2" },
  completionMode: "flag-zero-class-and-unit-result",
});

const definitions = [
  {
    panelIndex: 8,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row8-phase6-neutral-exact-projection-v1",
      field: { id:
        "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363",
      polynomialAscending: ["-20034", "-20018", "0", "0", "1"] },
      classGroup: { classNumber: "1", invariantFactors: [], generatorCount: "0" },
      unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
      completionMode: "flag-zero-class-and-unit-result",
    },
    expectedWorkMetadata: { classNumber: "1", degree: "4", unitRank: "2" },
    sage: ["row8_phase6_resident_prepared_adapter.cjs",
      ["createRow8ResidentPreparedAdapter"]],
    pari: ["generic_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "frozenFieldSpecification", "validateProjection"]],
  },
  {
    panelIndex: 10,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row10-phase6-neutral-exact-projection-v1",
      field: { id:
        "generated-sha256-984793770b4a15a79fbc9984fe352fbc867491917733c78bdba3b1856c18e3a7",
      polynomialAscending: ["-2000042", "-2000022", "0", "0", "1"] },
      classGroup: { classNumber: "4", invariantFactors: ["2", "2"],
        generatorCount: "2" },
      unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
      completionMode: "flag-zero-class-and-unit-result",
    },
    expectedWorkMetadata: { classNumber: "4", degree: "4", unitRank: "2" },
    sage: ["row10_phase6_resident_prepared_adapter.cjs",
      ["createRow10ResidentPreparedAdapter"]],
    pari: ["generic_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "frozenFieldSpecification", "validateProjection"]],
  },
  {
    panelIndex: 11,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row11-phase6-neutral-exact-projection-v1",
      field: { id:
        "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab",
      polynomialAscending: ["-2000018", "-2000010", "0", "0", "1"] },
      classGroup: { classNumber: "4", invariantFactors: ["2", "2"],
        generatorCount: "2" },
      unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
      completionMode: "flag-zero-class-and-unit-result",
    },
    expectedWorkMetadata: { classNumber: "4", degree: "4", unitRank: "2" },
    sage: ["row11_phase6_resident_prepared_adapter.cjs",
      ["createRow11ResidentPreparedAdapter"]],
    pari: ["generic_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "frozenFieldSpecification", "validateProjection"]],
  },
  {
    panelIndex: 0,
    expectedProjection: commonCubic({ row: 0,
      id: "pari-2.17.4:x^3-20018*x+20034",
      polynomial: ["20034", "-20018", "0", "1"],
      classNumber: "1", invariants: [] }),
    expectedWorkMetadata: { classNumber: "1", degree: "3", unitRank: "2" },
    sage: ["row0_phase6_matched_kernel_host.cjs", ["prepareResident",
      "prepareInvocation", "runInvocation"]],
    pari: ["row0_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "validateProjection"]],
  },
  {
    panelIndex: 1,
    expectedProjection: commonCubic({ row: 1,
      id: "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f",
      polynomial: ["20018", "-20010", "0", "1"],
      classNumber: "3", invariants: ["3"] }),
    expectedWorkMetadata: { classNumber: "3", degree: "3", unitRank: "2" },
    sage: ["row1_phase6_matched_kernel_host.cjs", ["prepareResident",
      "prepareInvocation", "runInvocation"]],
    pari: ["row1_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "validateProjection"]],
  },
  {
    panelIndex: 3,
    expectedProjection: commonCubic({ row: 3,
      id: "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9",
      polynomial: ["20000000042", "-20000000022", "0", "1"],
      classNumber: "6", invariants: ["6"] }),
    expectedWorkMetadata: { classNumber: "6", degree: "3", unitRank: "2" },
    sage: ["row3_phase6_resident_kernel_host.cjs", ["prepareResident",
      "runInvocation"]],
    pari: ["row3_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "validateProjection"]],
  },
  {
    panelIndex: 4,
    expectedProjection: commonCubic({ row: 4,
      id: "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9",
      polynomial: ["20000000018", "-20000000010", "0", "1"],
      classNumber: "2", invariants: ["2"] }),
    expectedWorkMetadata: { classNumber: "2", degree: "3", unitRank: "2" },
    sage: ["row4_phase6_matched_kernel_host.cjs", ["prepareResident",
      "prepareInvocation", "runInvocation"]],
    pari: ["row4_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "validateProjection"]],
  },
  {
    panelIndex: 14,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row14-prepared-common-projection-v1",
      field: { id:
        "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413",
      polynomialAscending: ["-200000002", "-200000002", "0", "0", "1"] },
      classGroup: { classNumber: "192", invariantFactors: ["8", "24"],
        generatorCount: "2" },
      unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2",
        flagZeroStatus: "not_given(LARGE)" },
      completionMode: "flag-zero-class-and-unit-result",
    },
    expectedWorkMetadata: { classNumber: "192", degree: "4", unitRank: "2" },
    sage: ["row14_matched_kernel_clock_host.cjs", ["prepareResident",
      "runResident"]],
    pari: ["row14_pari_prepared_timing_adapter.cjs", ["HelperClient",
      "buildHelper", "validateSample"]],
  },
  {
    panelIndex: 16,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row16-flag-zero-matched-projection-v1",
      field: { id: "3.1.1002718428660.2",
        polynomialAscending: ["-73393658", "-146523", "0", "1"] },
      classGroup: { classNumber: "27", invariantFactors: ["3", "3", "3"],
        generatorCount: "3" },
      unitGroup: { rank: "1", regulatorPresent: true, torsionOrder: "2",
        flagZeroStatus: "not_given(LARGE)" },
      terminalStatus: "pari-flag-zero-complete",
    },
    expectedWorkMetadata: { classNumber: "27", degree: "3", unitRank: "1" },
    sage: ["row16_phase6_sage_prepared_adapter.cjs", ["prepareResident",
      "runResident", "semanticProjection"]],
    pari: ["row16_phase6_pari_prepared_adapter.cjs", ["Client",
      "buildHelper", "commonProjection"]],
  },
  {
    panelIndex: 18,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row18-phase6-neutral-exact-projection-v1",
      field: { id: "3.1.1005907102200.3",
        polynomialAscending: ["-7353960", "177570", "0", "1"] },
      classGroup: { classNumber: "18", invariantFactors: ["18"],
        generatorCount: "1" },
      unitGroup: { rank: "1", regulatorPresent: true, torsionOrder: "2" },
      completionMode: "flag-zero-class-and-unit-result",
    },
    expectedWorkMetadata: { classNumber: "18", degree: "3", unitRank: "1" },
    sage: ["row18_phase6_resident_host.cjs", ["prepareInvocation",
      "prepareResident", "runInvocation"]],
    pari: ["generic_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "frozenFieldSpecification", "validateProjection"]],
  },
  {
    panelIndex: 19,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row19-phase6-common-projection-v1",
      field: { id: "3.1.1086061775432017340256300.107",
        polynomialAscending: ["-51050867718180330", "0", "0", "1"] },
      classGroup: { classNumber: "39366",
        invariantFactors: ["3", "3", "3", "3", "3", "3", "3", "3", "6"],
        generatorCount: "9" },
      unitGroup: { rank: "1", regulatorPresent: true, torsionOrder: "2" },
      completionMode: "flag-zero-class-and-unit-result",
    },
    expectedWorkMetadata: { classNumber: "39366", degree: "3", unitRank: "1" },
    sage: ["row19_phase6_sage_prepared_adapter.cjs", ["prepareResident",
      "runResident", "semanticProjection"]],
    pari: ["row19_phase6_pari_prepared_adapter.cjs", ["Client",
      "buildHelper", "commonProjection"]],
  },
  {
    panelIndex: 20,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row20-phase6-neutral-exact-projection-v1",
      field: { id: "5.1.1000000.1",
        polynomialAscending: ["-12", "-5", "0", "0", "0", "1"] },
      classGroup: { classNumber: "1", invariantFactors: [], generatorCount: "0" },
      unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
      completionMode: "flag-zero-class-and-unit-result",
    },
    expectedWorkMetadata: { classNumber: "1", degree: "5", unitRank: "2" },
    sage: ["row20_phase6_resident_kernel.cjs", ["prepareResident",
      "runResident"]],
    pari: ["generic_phase6_pari_prepared_adapter.cjs", ["HelperClient",
      "buildHelper", "frozenFieldSpecification", "validateProjection"]],
  },
  {
    panelIndex: 23,
    expectedProjection: {
      schema: "sagejs.pari-class-group/row23-phase6-common-projection-v1",
      field: { id: "5.5.1002836007889.1",
        polynomialAscending: ["341", "-970", "772", "-141", "-2", "1"] },
      classGroup: { classNumber: "6", invariantFactors: ["6"] },
      unitGroup: { rank: "4", regulatorPresent: true, torsionOrder: "2" },
      completionMode: "flag-zero-class-and-unit-result",
    },
    expectedWorkMetadata: { classNumber: "6", degree: "5", unitRank: "4" },
    sage: ["row23_phase6_sage_prepared_adapter.cjs", ["prepareResident",
      "runResident", "semanticProjection"]],
    pari: ["row23_phase6_pari_prepared_adapter.cjs", ["Client",
      "buildHelper", "commonProjection"]],
  },
];

function descriptor(panelIndex, implementation, projectionSchema) {
  return Object.freeze({
    schema: worker.ADAPTER_SCHEMA,
    implementation,
    modulePath: WRAPPER_PATH,
    exportName: FACTORY,
    projectionSchema,
    configuration: Object.freeze({ panelIndex, implementation }),
  });
}

function registration(definition) {
  const projection = structuredClone(definition.expectedProjection);
  const projectionSchema = projection.schema;
  return Object.freeze({
    schema: REGISTRATION_SCHEMA,
    panelIndex: definition.panelIndex,
    fieldId: projection.field.id,
    boundary: "prepared-kernel",
    projectionSchema,
    expectedProjection: deepFreeze(projection),
    expectedWorkMetadata: deepFreeze({ ...definition.expectedWorkMetadata }),
    requirements: Object.freeze({
      sagejs: Object.freeze({ modulePath: path.join(__dirname,
        definition.sage[0]), exports: Object.freeze(definition.sage[1]) }),
      pari: Object.freeze({ modulePath: path.join(__dirname,
        definition.pari[0]), exports: Object.freeze(definition.pari[1]) }),
    }),
    adapters: Object.freeze({
      sagejs: descriptor(definition.panelIndex, "sagejs", projectionSchema),
      pari: descriptor(definition.panelIndex, "pari", projectionSchema),
    }),
    admissionCapability: null,
    admission: deepFreeze({ status: "diagnostic-only", matchedReady: false,
      freshCorrectness: true, sagePreparedKernelTiming: false,
      pariPreparedKernelTiming: false, commonSemanticProjection: false,
      mutuallyExclusiveStageTiming: false,
      stageAttribution: "not-admitted",
      missingCapabilities: [...REQUIRED_CAPABILITIES] }),
  });
}

const REGISTERED = Object.freeze(definitions.map(registration));

function validateRequirement(requirement, label, { loadModules = true } = {}) {
  exactKeys(requirement, ["exports", "modulePath"], label);
  assert.equal(typeof requirement.modulePath, "string");
  assert(path.isAbsolute(requirement.modulePath), `${label} path must be absolute`);
  assert(fs.existsSync(requirement.modulePath), `${label} module is missing`);
  assert(fs.statSync(requirement.modulePath).isFile(), `${label} is not a file`);
  assert(Array.isArray(requirement.exports) && requirement.exports.length > 0,
    `${label} has no required exports`);
  if (loadModules) {
    const module = require(requirement.modulePath);
    for (const name of requirement.exports)
      assert.equal(typeof module[name], "function", `${label} lacks ${name}()`);
  }
}

function validateCapability(capability, registration) {
  exactKeys(capability, ["coverage", "evidence", "fieldId", "panelIndex",
    "projectionSchema", "sampleContract", "schema", "verifier"],
  "v2 admission capability");
  assert.equal(capability.schema, CAPABILITY_SCHEMA);
  assert.equal(capability.panelIndex, registration.panelIndex,
    "v2 capability row differs from registration");
  assert.equal(capability.fieldId, registration.fieldId,
    "v2 capability field differs from registration");
  assert.equal(capability.projectionSchema, registration.projectionSchema,
    "v2 capability projection schema differs from registration");
  exactKeys(capability.evidence, ["modulePath", "schema", "sha256"],
    "v2 admission evidence");
  exactKeys(capability.verifier, ["evidenceExportName", "modulePath",
    "sampleExportName", "sha256"],
    "v2 admission verifier");
  assert.equal(capability.evidence.schema,
    `sagejs.pari-class-group/row${registration.panelIndex}-phase6-matched-state-evidence-v2`,
    "v2 evidence schema must be bound to the registration row");
  const trusted = TRUSTED_V2_ADMISSIONS.find(value =>
    value.panelIndex === registration.panelIndex);
  assert(trusted,
    `row ${registration.panelIndex} has no centrally trusted v2 admission`);
  assert.deepEqual(capability, trusted,
    `row ${registration.panelIndex} v2 capability differs from central authority`);
  exactKeys(capability.sampleContract, ["mutationNames", "precisionStateSchema",
    "nativeCallObservationSchema", "provenance", "replaySchema",
    "retryStateSchema", "stateEnvelopeSchema", "terminalStateSchema",
    "workCounterKeys", "workObservationSchema"], "v2 sample contract");
  assert.deepEqual(capability.sampleContract.mutationNames, MUTATION_FAMILIES);
  assert(Array.isArray(capability.sampleContract.workCounterKeys) &&
    capability.sampleContract.workCounterKeys.length > 0);
  assert.equal(new Set(capability.sampleContract.workCounterKeys).size,
    capability.sampleContract.workCounterKeys.length);
  for (const key of capability.sampleContract.workCounterKeys)
    assert.match(key, /^[A-Za-z][A-Za-z0-9]*$/);
  exactKeys(capability.sampleContract.provenance,
    ["adapterSha256", "cacheSha256", "coreSha256", "sourceSha256"],
    "v2 pinned provenance");
  for (const hash of Object.values(capability.sampleContract.provenance))
    assert.match(hash, SHA256);
  for (const key of ["nativeCallObservationSchema", "replaySchema",
    "stateEnvelopeSchema", "terminalStateSchema", "precisionStateSchema",
    "retryStateSchema", "workObservationSchema"])
    assert.equal(typeof capability.sampleContract[key], "string");
  for (const [label, item] of [["evidence", capability.evidence],
    ["verifier", capability.verifier]]) {
    assert(path.isAbsolute(item.modulePath), `${label} path must be absolute`);
    assert(fs.existsSync(item.modulePath), `${label} module is missing`);
    assert(fs.statSync(item.modulePath).isFile(), `${label} is not a file`);
    assert.match(item.sha256, SHA256, `${label} SHA-256 is malformed`);
    const actual = require("node:crypto").createHash("sha256")
      .update(fs.readFileSync(item.modulePath)).digest("hex");
    assert.equal(actual, item.sha256, `${label} source hash changed`);
  }
  assert.equal(typeof capability.verifier.evidenceExportName, "string");
  assert.equal(typeof capability.verifier.sampleExportName, "string");
  exactKeys(capability.coverage, COVERAGE_KEYS, "v2 evidence coverage");
  for (const key of COVERAGE_KEYS)
    assert.equal(capability.coverage[key], true, `v2 coverage lacks ${key}`);
  // Unlike diagnostic module checks, trusted v2 evidence authentication can
  // never be bypassed through a validation option.
  const verifierModule = require(capability.verifier.modulePath);
  const verifier = verifierModule[capability.verifier.evidenceExportName];
  assert.equal(typeof verifier, "function", "v2 evidence verifier is missing");
  assert.equal(typeof verifierModule[capability.verifier.sampleExportName],
    "function", "v2 live-sample verifier is missing");
  const evidence = JSON.parse(fs.readFileSync(capability.evidence.modulePath,
    "utf8"));
  const verdict = verifier(evidence);
  assert(verdict && typeof verdict === "object" && !Array.isArray(verdict),
    "v2 evidence verifier returned no verdict");
  exactKeys(verdict, ["coverage", "evidenceSchema", "matchedReady",
    "panelIndex"], "v2 verifier verdict");
  assert.equal(verdict.panelIndex, registration.panelIndex);
  assert.equal(verdict.evidenceSchema, capability.evidence.schema);
  assert.equal(verdict.matchedReady, true);
  assert.deepEqual(verdict.coverage, capability.coverage);
  return capability;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const digest = value => require("node:crypto").createHash("sha256")
  .update(canonical(value)).digest("hex");

function positiveIntegerString(value, label) {
  assert.equal(typeof value, "string", `${label} must be an integer string`);
  assert.match(value, /^[1-9][0-9]*$/, `${label} must be positive`);
}

function nonnegativeIntegerString(value, label) {
  assert.equal(typeof value, "string", `${label} must be an integer string`);
  assert.match(value, /^(0|[1-9][0-9]*)$/, `${label} must be nonnegative`);
}

function validateState(value, schema, label) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${label} must be materialized`);
  assert.equal(value.schema, schema, `${label} schema differs from authority`);
}

function validateMatchedSampleV2({ registration, capability, verified }) {
  const centralRegistration = REGISTERED.find(value =>
    value.panelIndex === registration.panelIndex);
  assert.equal(registration, centralRegistration,
    "live v2 sample registration is not the central registry authority");
  const trusted = TRUSTED_V2_ADMISSIONS.find(value =>
    value.panelIndex === registration.panelIndex);
  assert(trusted,
    `row ${registration.panelIndex} has no centrally trusted v2 admission`);
  assert.deepEqual(capability, trusted,
    "live sample capability differs from central authority");
  exactKeys(verified, ["observations", "sample"], "v2 verifier result");
  const { observations, sample } = verified;
  exactKeys(sample, ["counters", "kernelNanoseconds", "output", "peakRssKiB",
    "replay", "resourceCounters", "rng", "stageTiming",
    "threadCpuNanoseconds"], "v2 matched sample");
  for (const [label, value] of [["kernelNanoseconds", sample.kernelNanoseconds],
    ["peakRssKiB", sample.peakRssKiB]]) positiveIntegerString(value, label);
  nonnegativeIntegerString(sample.threadCpuNanoseconds, "threadCpuNanoseconds");

  exactKeys(sample.output, ["field", "matchedState", "provenance", "schema"],
    "v2 matched output");
  assert.equal(sample.output.schema, registration.projectionSchema);
  exactKeys(sample.output.field, ["id", "polynomialAscending"],
    "v2 output field");
  assert.equal(sample.output.field.id, registration.fieldId);
  assert(Array.isArray(sample.output.field.polynomialAscending) &&
    sample.output.field.polynomialAscending.length >= 2,
  "v2 output polynomial is missing");
  const state = sample.output.matchedState;
  exactKeys(state, ["classGroup", "precision", "regulator", "retry",
    "terminal", "torsion", "unitGroup"], "v2 complete matched state");
  exactKeys(state.classGroup,
    ["classNumber", "generators", "invariantFactors"], "v2 class group");
  positiveIntegerString(state.classGroup.classNumber, "class number");
  assert(Array.isArray(state.classGroup.invariantFactors));
  assert(Array.isArray(state.classGroup.generators));
  let invariantProduct = 1n;
  for (const factor of state.classGroup.invariantFactors) {
    positiveIntegerString(factor, "class invariant factor");
    assert(BigInt(factor) > 1n, "class invariant factors must be nontrivial");
    invariantProduct *= BigInt(factor);
  }
  assert.equal(invariantProduct, BigInt(state.classGroup.classNumber),
    "class invariant factors do not multiply to the class number");
  if (state.classGroup.invariantFactors.length === 0) {
    assert.deepEqual(state.classGroup.generators, []);
  } else {
    assert.equal(state.classGroup.generators.length,
      state.classGroup.invariantFactors.length,
      "nontrivial class factors require generator evidence");
    for (const [index, generator] of state.classGroup.generators.entries()) {
      exactKeys(generator, ["ideal", "order", "principalWitness"],
        "v2 class generator");
      positiveIntegerString(generator.order, "class generator order");
      assert.equal(generator.order, state.classGroup.invariantFactors[index],
        "class generator order differs from its invariant factor");
      assert.notEqual(generator.ideal, null);
      assert.notEqual(generator.principalWitness, null);
    }
  }
  exactKeys(state.unitGroup, ["basis", "mode", "notGivenState"],
    "v2 unit group");
  assert(["compact", "factored", "not_given"].includes(state.unitGroup.mode));
  if (state.unitGroup.mode === "not_given") {
    assert.equal(state.unitGroup.basis, null);
    assert(state.unitGroup.notGivenState &&
      typeof state.unitGroup.notGivenState === "object");
  } else {
    assert(Array.isArray(state.unitGroup.basis) && state.unitGroup.basis.length > 0,
      "materialized unit basis is missing");
    assert.equal(state.unitGroup.notGivenState, null);
  }
  exactKeys(state.regulator, ["logLattice", "value"], "v2 regulator");
  assert.notEqual(state.regulator.value, null);
  assert(Array.isArray(state.regulator.logLattice) &&
    state.regulator.logLattice.length > 0, "v2 regulator log lattice is missing");
  exactKeys(state.torsion, ["generator", "order"], "v2 torsion");
  positiveIntegerString(state.torsion.order, "torsion order");
  assert.notEqual(state.torsion.generator, null, "torsion generator is missing");
  const contract = capability.sampleContract;
  validateState(state.terminal, contract.terminalStateSchema, "terminal state");
  validateState(state.precision, contract.precisionStateSchema, "precision state");
  validateState(state.retry, contract.retryStateSchema, "retry state");
  assert.deepEqual(sample.output.provenance, contract.provenance,
    "output provenance differs from pinned authority");

  exactKeys(sample.replay, ["evidence", "evidenceDigest", "independentReplay",
    "mutationCoverage", "outputDigest", "provenance", "schema"],
  "v2 independent replay");
  assert.equal(sample.replay.schema, contract.replaySchema);
  assert.notEqual(sample.replay.schema, sample.output.schema,
    "output and replay schemas must be distinct");
  assert.equal(sample.replay.independentReplay, true);
  assert.notDeepEqual(sample.replay.evidence, sample.output,
    "independent replay evidence must differ from output");
  assert.equal(sample.replay.outputDigest, digest(sample.output));
  assert.equal(sample.replay.evidenceDigest, digest(sample.replay.evidence));
  assert.notEqual(sample.replay.outputDigest, sample.replay.evidenceDigest,
    "output and replay evidence digests must be distinct");
  assert.deepEqual(sample.replay.provenance, contract.provenance);
  exactKeys(sample.replay.mutationCoverage, MUTATION_FAMILIES,
    "v2 replay mutation coverage");
  for (const name of MUTATION_FAMILIES)
    assert.equal(sample.replay.mutationCoverage[name], true,
      `v2 replay lacks mutation coverage for ${name}`);

  exactKeys(sample.counters, contract.workCounterKeys, "observed work counters");
  for (const [name, value] of Object.entries(sample.counters))
    positiveIntegerString(value, `observed work counter ${name}`);
  exactKeys(sample.resourceCounters, ["nativeCalls"], "native-call counters");
  positiveIntegerString(sample.resourceCounters.nativeCalls, "native calls");
  exactKeys(observations, ["nativeCalls", "provenance", "workCounters"],
    "independent observations");
  exactKeys(observations.workCounters,
    ["derivationEvidence", "evidenceDigest", "schema", "values"],
  "independent work-counter observation");
  assert.equal(observations.workCounters.schema, contract.workObservationSchema);
  assert.notEqual(observations.workCounters.derivationEvidence, null);
  assert.equal(observations.workCounters.evidenceDigest,
    digest(observations.workCounters.derivationEvidence));
  assert.deepEqual(observations.workCounters.values, sample.counters,
    "sample work counters were not derived from observations");
  exactKeys(observations.nativeCalls,
    ["derivationEvidence", "evidenceDigest", "schema", "value"],
  "independent native-call observation");
  assert.equal(observations.nativeCalls.schema,
    contract.nativeCallObservationSchema);
  assert.notEqual(observations.nativeCalls.derivationEvidence, null);
  assert.equal(observations.nativeCalls.evidenceDigest,
    digest(observations.nativeCalls.derivationEvidence));
  assert.equal(observations.nativeCalls.value, sample.resourceCounters.nativeCalls,
    "sample native calls were not derived from observations");
  assert.notDeepEqual(observations.workCounters.derivationEvidence,
    observations.nativeCalls.derivationEvidence,
    "work and native-call observations require distinct derivation evidence");
  assert.deepEqual(observations.provenance, contract.provenance,
    "observed provenance differs from pinned authority");

  exactKeys(sample.rng, ["precision", "retry", "schema", "terminal"],
    "v2 terminal state envelope");
  assert.equal(sample.rng.schema, contract.stateEnvelopeSchema);
  assert.deepEqual(sample.rng.terminal, state.terminal);
  assert.deepEqual(sample.rng.precision, state.precision);
  assert.deepEqual(sample.rng.retry, state.retry);
  exactKeys(sample.stageTiming,
    ["inclusiveNanoseconds", "leaves", "unattributedNanoseconds"],
  "v2 stage timing");
  assert.equal(sample.stageTiming.inclusiveNanoseconds, sample.kernelNanoseconds);
  exactKeys(sample.stageTiming.leaves, ["honestyGeneratorsFinal",
    "relationRetry", "sparseHnfSnfTransform", "unitRegulator"],
  "v2 stage timing leaves");
  for (const [name, value] of Object.entries(sample.stageTiming.leaves))
    nonnegativeIntegerString(value, `stage timing leaf ${name}`);
  nonnegativeIntegerString(sample.stageTiming.unattributedNanoseconds,
    "unattributed stage timing");
  const leafTotal = Object.values(sample.stageTiming.leaves)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  const remainder = BigInt(sample.stageTiming.unattributedNanoseconds);
  assert.equal(leafTotal + remainder, BigInt(sample.kernelNanoseconds));
  return sample;
}

const diagnosticAdmission = () => ({ status: "diagnostic-only",
  matchedReady: false, freshCorrectness: true,
  sagePreparedKernelTiming: false, pariPreparedKernelTiming: false,
  commonSemanticProjection: false, mutuallyExclusiveStageTiming: false,
  stageAttribution: "not-admitted",
  missingCapabilities: [...REQUIRED_CAPABILITIES] });

const matchedAdmission = () => ({ status: "v2-evidence-verified",
  matchedReady: true, freshCorrectness: true,
  sagePreparedKernelTiming: true, pariPreparedKernelTiming: true,
  commonSemanticProjection: true, mutuallyExclusiveStageTiming: true,
  stageAttribution: "inclusive-root-with-explicit-unattributed-remainder",
  missingCapabilities: [] });

function validateRegistration(value, options = {}) {
  exactKeys(value, ["adapters", "admission", "admissionCapability", "boundary",
    "expectedProjection", "expectedWorkMetadata", "fieldId", "panelIndex",
    "projectionSchema", "requirements", "schema"],
  "prepared adapter registration");
  assert.equal(value.schema, REGISTRATION_SCHEMA);
  assert(Number.isSafeInteger(value.panelIndex) && value.panelIndex >= 0);
  assert.equal(value.boundary, "prepared-kernel");
  assert.equal(value.expectedProjection.schema, value.projectionSchema,
    "expected projection schema differs from registration");
  assert.equal(value.expectedProjection.field.id, value.fieldId,
    "expected projection field differs from registration");
  exactKeys(value.adapters, ["pari", "sagejs"], "adapter pair");
  exactKeys(value.requirements, ["pari", "sagejs"], "implementation requirements");
  for (const implementation of ["sagejs", "pari"]) {
    const adapter = worker.validateDescriptor(value.adapters[implementation]);
    assert.equal(adapter.implementation, implementation);
    assert.equal(adapter.projectionSchema, value.projectionSchema,
      `${implementation} projection schema differs from registration`);
    assert.deepEqual(adapter.configuration,
      { panelIndex: value.panelIndex, implementation },
      `${implementation} adapter configuration differs from registration`);
    assert.equal(adapter.modulePath, WRAPPER_PATH,
      `${implementation} must use the reviewed generic wrapper`);
    assert.equal(adapter.exportName, FACTORY,
      `${implementation} must use the reviewed generic factory`);
    validateRequirement(value.requirements[implementation], implementation, options);
  }
  assert.deepEqual(Object.keys(value.expectedWorkMetadata).sort(),
    ["classNumber", "degree", "unitRank"]);
  for (const item of Object.values(value.expectedWorkMetadata))
    assert.match(item, /^(0|[1-9][0-9]*)$/);
  if (value.admissionCapability === null) {
    assert.deepEqual(value.admission, diagnosticAdmission());
  } else {
    validateCapability(value.admissionCapability, value);
    assert.deepEqual(value.admission, matchedAdmission());
  }
  return value;
}

function validateRegistry(entries = REGISTERED, options = {}) {
  assert(Array.isArray(entries), "prepared adapter registry must be an array");
  const validated = entries.map(value => validateRegistration(value, options));
  const indices = validated.map(value => value.panelIndex);
  assert.equal(new Set(indices).size, indices.length,
    "prepared adapter registry has duplicate panel indices");
  return Object.freeze([...validated].sort((left, right) =>
    left.panelIndex - right.panelIndex));
}

function preparedAdapterRegistration(panelIndex) {
  const found = diagnosticPreparedAdapterRegistration(panelIndex);
  assert.equal(found.admission.matchedReady, true,
    `development row ${panelIndex} is diagnostic-only; missing v2 capabilities: ${found.admission.missingCapabilities.join(", ")}`);
  return found;
}

function diagnosticPreparedAdapterRegistration(panelIndex) {
  const found = REGISTERED.find(value => value.panelIndex === panelIndex);
  assert(found, `development row ${panelIndex} has no prepared adapter inventory`);
  return validateRegistration(found);
}

function inventory(entries = REGISTERED, options = {}) {
  const registered = validateRegistry(entries, options);
  const summarize = value => Object.freeze({
    panelIndex: value.panelIndex,
    fieldId: value.fieldId,
    projectionSchema: value.projectionSchema,
    ...value.admission,
  });
  return Object.freeze({
    schema: REGISTRY_SCHEMA,
    executionEnabled: false,
    reserveOpeningEnabled: false,
    rows: Object.freeze(registered.filter(value => value.admission.matchedReady)
      .map(summarize)),
    diagnosticRows: Object.freeze(registered.map(summarize)),
  });
}

module.exports = { CAPABILITY_SCHEMA, COVERAGE_KEYS, FACTORY, MUTATION_FAMILIES,
  REGISTERED, REGISTRATION_SCHEMA, REGISTRY_SCHEMA, REQUIRED_CAPABILITIES,
  TRUSTED_V2_ADMISSIONS, WRAPPER_PATH,
  diagnosticPreparedAdapterRegistration, inventory, preparedAdapterRegistration,
  validateCapability, validateMatchedSampleV2, validateRegistration,
  validateRegistry };

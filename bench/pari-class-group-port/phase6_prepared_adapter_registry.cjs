"use strict";

// Static, field-neutral inventory and fail-closed admission gate for Phase-6
// prepared-kernel adapter pairs.  Merely exposing two modules and a shared
// metadata projection is diagnostic information, not matched-output evidence.
// A row is admitted only by a row-specific v2 evidence verifier.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const worker = require("./qualification_arm_worker.cjs");
const row14NativeProvenance = require("./row14_live_native_provenance.cjs");

const REGISTRY_SCHEMA =
  "sagejs.pari-class-group/phase6-prepared-adapter-registry-v2";
const REGISTRATION_SCHEMA =
  "sagejs.pari-class-group/phase6-prepared-adapter-registration-v2";
const CAPABILITY_SCHEMA =
  "sagejs.pari-class-group/phase6-matched-state-admission-capability-v2";
const PROVENANCE_MANIFEST_SCHEMA =
  "sagejs.pari-class-group/phase6-implementation-provenance-manifest-v1";
const CPU_OBSERVATION_SCHEMA =
  "sagejs.pari-class-group/phase6-cpu-observation-v1";
const WRAPPER_PATH = path.join(__dirname,
  "phase6_registered_prepared_adapter.cjs");
const FACTORY = "createRegisteredPreparedAdapter";

const REQUIRED_CAPABILITIES = Object.freeze([
  "sage-correctness-evidence-verifier",
  "row-specific-matched-sample-verifier",
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
]);

const CORRECTNESS_COVERAGE_KEYS = Object.freeze([
  "class-invariants",
  "class-generator-ideals-orders-principal-witnesses",
  "unit-compact-or-factored-basis-or-exact-not-given",
  "regulator-value-and-log-lattice-semantics",
  "torsion",
  "terminal-precision-retry-state",
  "independent-replay-distinct-from-output",
  "replay-mutation-coverage",
  "source-and-provenance-hashes",
]);
const COVERAGE_KEYS = CORRECTNESS_COVERAGE_KEYS;
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
// Row 14 is the first admission.  Its literal verifier/evidence hashes make
// this committed array the authority; callers still cannot inject trust.
const ROW14_V2_VERIFIER = path.join(__dirname,
  "row14_phase6_matched_state_verifier.cjs");
const ROW14_V2_EVIDENCE = path.join(__dirname,
  "row14_phase6_matched_state_evidence_v2.json");
const TRUSTED_V2_ADMISSIONS = deepFreeze([{
  schema: CAPABILITY_SCHEMA,
  panelIndex: 14,
  fieldId:
    "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413",
  matchedOutputSchema:
    "sagejs.pari-class-group/row14-phase6-matched-output-v2",
  sageCorrectness: {
    coverage: Object.fromEntries(CORRECTNESS_COVERAGE_KEYS.map(key => [key, true])),
    evidence: { modulePath: ROW14_V2_EVIDENCE,
      schema:
        "sagejs.pari-class-group/row14-phase6-matched-state-evidence-v2",
      sha256:
        "29420bd4190155d099bfb77ed366db7752e4841c07419aea7c45cca7287c71d5" },
    leanSemanticDigest:
      "4ee64df04c4d0e5fab66b0978909eae6001a2e36b4526ead143f5ce700cad949",
    mutationNames: [...MUTATION_FAMILIES],
    verifier: { exportName: "verifySageCorrectnessEvidence",
      modulePath: ROW14_V2_VERIFIER,
      sha256:
        "1a335637ee8d7d89067c1928f6e6c5dfa3f3f3f51ad91cab0cb3bf0acf6c7aae" },
  },
  matchedSample: {
    verifier: { exportName: "verifyMatchedSample",
      modulePath: ROW14_V2_VERIFIER,
      sha256:
        "1a335637ee8d7d89067c1928f6e6c5dfa3f3f3f51ad91cab0cb3bf0acf6c7aae" },
    contract: {
      cpuPolicy: {
        sagejs: { availability: "required",
          authorities: ["process-thread-self"] },
        pari: { availability: "optional",
          authorities: ["pari-child-rusage",
            "unavailable-parent-cannot-measure-child"] },
      },
      nativeCallObservationSchema:
        "sagejs.pari-class-group/row14-phase6-native-call-observation-v1",
      precisionStateSchema:
        "sagejs.pari-class-group/row14-phase6-precision-state-v1",
      provenanceByImplementation: require(ROW14_V2_VERIFIER)
        .PROVENANCE_BY_IMPLEMENTATION,
      retryStateSchema:
        "sagejs.pari-class-group/row14-phase6-retry-state-v1",
      stageTimingLeafKeys: ["relationRetry", "sparseHnfSnfTransform",
        "unitRegulator", "honestyGeneratorsFinal"],
      stateEnvelopeSchema:
        "sagejs.pari-class-group/row14-phase6-state-envelope-v1",
      terminalStateSchema:
        "sagejs.pari-class-group/row14-phase6-terminal-state-v1",
      workCounterKeys: ["classHnfColumns", "degree", "factorBaseSize",
        "logEmbeddingColumns", "logEmbeddingRows"],
      workObservationSchema:
        "sagejs.pari-class-group/row14-phase6-work-observation-v1",
    },
  },
}]);

// These are the rows for which phase6_registered_prepared_adapter.cjs has both
// a Sage.js preparation path and a PARI execution path. Diagnostic inventory is
// allowed to be broader, but the trust root may never consume a row outside
// this set.
const DISPATCHABLE_PANEL_INDICES = Object.freeze([
  0, 1, 3, 4, 8, 10, 11, 14, 16, 18, 20, 23,
]);

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
    expectedDiagnosticProjection: {
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
    expectedDiagnosticProjection: {
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
    expectedDiagnosticProjection: {
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
    expectedDiagnosticProjection: commonCubic({ row: 0,
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
    expectedDiagnosticProjection: commonCubic({ row: 1,
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
    expectedDiagnosticProjection: commonCubic({ row: 3,
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
    expectedDiagnosticProjection: commonCubic({ row: 4,
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
    expectedDiagnosticProjection: {
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
    expectedDiagnosticProjection: {
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
    expectedDiagnosticProjection: {
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
    expectedDiagnosticProjection: {
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
    expectedDiagnosticProjection: {
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
    expectedDiagnosticProjection: {
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

function registration(definition, trustedCapability) {
  const projection = structuredClone(definition.expectedDiagnosticProjection);
  const diagnosticProjectionSchema = projection.schema;
  const matchedOutputSchema = trustedCapability?.matchedOutputSchema ?? null;
  return Object.freeze({
    schema: REGISTRATION_SCHEMA,
    panelIndex: definition.panelIndex,
    fieldId: projection.field.id,
    boundary: "prepared-kernel",
    diagnosticProjectionSchema,
    expectedDiagnosticProjection: deepFreeze(projection),
    matchedOutputSchema,
    expectedWorkMetadata: deepFreeze({ ...definition.expectedWorkMetadata }),
    requirements: Object.freeze({
      sagejs: Object.freeze({ modulePath: path.join(__dirname,
        definition.sage[0]), exports: Object.freeze(definition.sage[1]) }),
      pari: Object.freeze({ modulePath: path.join(__dirname,
        definition.pari[0]), exports: Object.freeze(definition.pari[1]) }),
    }),
    adapters: Object.freeze({
      sagejs: descriptor(definition.panelIndex, "sagejs",
        matchedOutputSchema ?? diagnosticProjectionSchema),
      pari: descriptor(definition.panelIndex, "pari",
        matchedOutputSchema ?? diagnosticProjectionSchema),
    }),
    admissionCapability: trustedCapability ?? null,
    admission: deepFreeze(trustedCapability ? matchedAdmission()
      : diagnosticAdmission()),
  });
}

function validateTrustIndexSets(definitionRows, trustedRows, dispatchableRows) {
  assert(Array.isArray(definitionRows) && Array.isArray(trustedRows) &&
    Array.isArray(dispatchableRows));
  for (const row of [...definitionRows, ...trustedRows, ...dispatchableRows])
    assert(Number.isSafeInteger(row) && row >= 0,
      "trust wiring indices must be nonnegative safe integers");
  assert.equal(new Set(definitionRows).size, definitionRows.length,
    "prepared adapter definitions have duplicate panel indices");
  assert.equal(new Set(trustedRows).size, trustedRows.length,
    "trusted v2 admissions have duplicate panel indices");
  assert.equal(new Set(dispatchableRows).size, dispatchableRows.length,
    "dispatchable rows have duplicate panel indices");
  for (const row of dispatchableRows)
    assert(definitionRows.includes(row),
      `dispatchable row ${row} is orphaned from the inventory`);
  for (const row of trustedRows)
    assert(definitionRows.includes(row),
      `trusted v2 admission row ${row} is orphaned from the inventory`);
  for (const row of trustedRows)
    assert(dispatchableRows.includes(row),
      `trusted v2 admission row ${row} has no complete wrapper dispatch`);
  return Object.freeze(definitionRows.map(panelIndex => Object.freeze({
    panelIndex, trusted: trustedRows.includes(panelIndex),
  })));
}

function wireTrustedAdmissions(definitionsToWire, trustedAdmissions) {
  const definitionRows = definitionsToWire.map(value => value.panelIndex);
  const trustedRows = trustedAdmissions.map(value => value.panelIndex);
  validateTrustIndexSets(definitionRows, trustedRows,
    DISPATCHABLE_PANEL_INDICES);
  const consumed = new Set();
  const registrations = definitionsToWire.map(definition => {
    const capability = trustedAdmissions.find(value =>
      value.panelIndex === definition.panelIndex);
    if (capability) {
      assert(!consumed.has(capability),
        `trusted v2 admission row ${definition.panelIndex} was consumed twice`);
      consumed.add(capability);
    }
    return registration(definition, capability);
  });
  assert.equal(consumed.size, trustedAdmissions.length,
    "trusted v2 admissions were not consumed exactly once");
  return Object.freeze(registrations);
}

const REGISTERED = wireTrustedAdmissions(definitions, TRUSTED_V2_ADMISSIONS);

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

function authenticateFile(item, label) {
  assert(path.isAbsolute(item.modulePath), `${label} path must be absolute`);
  assert(fs.existsSync(item.modulePath), `${label} module is missing`);
  assert(fs.statSync(item.modulePath).isFile(), `${label} is not a file`);
  assert.match(item.sha256, SHA256, `${label} SHA-256 is malformed`);
  const actual = require("node:crypto").createHash("sha256")
    .update(fs.readFileSync(item.modulePath)).digest("hex");
  assert.equal(actual, item.sha256, `${label} source hash changed`);
}

function validateImplementationProvenance(manifest, implementation) {
  exactKeys(manifest, ["artifacts", "implementation", "schema"],
    `${implementation} provenance manifest`);
  assert.equal(manifest.schema, PROVENANCE_MANIFEST_SCHEMA);
  assert.equal(manifest.implementation, implementation);
  assert(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0,
    `${implementation} provenance has no artifacts`);
  const roles = [];
  for (const artifact of manifest.artifacts) {
    exactKeys(artifact, ["role", "sha256"],
      `${implementation} provenance artifact`);
    assert.match(artifact.role, /^[a-z][a-z0-9-]*$/);
    assert.match(artifact.sha256, SHA256);
    roles.push(artifact.role);
  }
  assert.equal(new Set(roles).size, roles.length,
    `${implementation} provenance has duplicate artifact roles`);
}

function validateCapability(capability, registration) {
  exactKeys(capability, ["fieldId", "matchedOutputSchema", "matchedSample",
    "panelIndex", "sageCorrectness", "schema"], "v2 admission capability");
  assert.equal(capability.schema, CAPABILITY_SCHEMA);
  assert.equal(capability.panelIndex, registration.panelIndex,
    "v2 capability row differs from registration");
  assert.equal(capability.fieldId, registration.fieldId,
    "v2 capability field differs from registration");
  assert.equal(capability.matchedOutputSchema, registration.matchedOutputSchema,
    "v2 matched-output schema differs from registration");
  assert.notEqual(capability.matchedOutputSchema,
    registration.diagnosticProjectionSchema,
    "matched output and diagnostic projection schemas must be distinct");
  assert.match(capability.matchedOutputSchema,
    /^sagejs\.pari-class-group\/[A-Za-z0-9._/-]+$/);

  const correctness = capability.sageCorrectness;
  exactKeys(correctness, ["coverage", "evidence", "leanSemanticDigest",
    "mutationNames", "verifier"], "Sage.js correctness admission");
  assert.match(correctness.leanSemanticDigest, SHA256,
    "Sage.js correctness lean-semantic digest is malformed");
  exactKeys(correctness.evidence, ["modulePath", "schema", "sha256"],
    "Sage.js correctness evidence");
  exactKeys(correctness.verifier, ["exportName", "modulePath", "sha256"],
    "Sage.js correctness verifier");
  assert.equal(correctness.evidence.schema,
    `sagejs.pari-class-group/row${registration.panelIndex}-phase6-matched-state-evidence-v2`,
    "v2 evidence schema must be bound to the registration row");
  const trusted = TRUSTED_V2_ADMISSIONS.find(value =>
    value.panelIndex === registration.panelIndex);
  assert(trusted,
    `row ${registration.panelIndex} has no centrally trusted v2 admission`);
  assert.equal(capability, trusted,
    `row ${registration.panelIndex} v2 capability differs from central authority`);
  assert.deepEqual(correctness.mutationNames, MUTATION_FAMILIES);
  exactKeys(correctness.coverage, CORRECTNESS_COVERAGE_KEYS,
    "Sage.js correctness coverage");
  for (const key of CORRECTNESS_COVERAGE_KEYS)
    assert.equal(correctness.coverage[key], true,
      `Sage.js correctness coverage lacks ${key}`);

  const matched = capability.matchedSample;
  exactKeys(matched, ["contract", "verifier"], "matched sample admission");
  exactKeys(matched.verifier, ["exportName", "modulePath", "sha256"],
    "matched sample verifier");
  const contract = matched.contract;
  exactKeys(contract, ["cpuPolicy", "nativeCallObservationSchema",
    "precisionStateSchema", "provenanceByImplementation", "retryStateSchema",
    "stageTimingLeafKeys", "stateEnvelopeSchema", "terminalStateSchema",
    "workCounterKeys", "workObservationSchema"], "v2 matched sample contract");
  assert(Array.isArray(contract.workCounterKeys) &&
    contract.workCounterKeys.length > 0);
  assert.equal(new Set(contract.workCounterKeys).size,
    contract.workCounterKeys.length);
  for (const key of contract.workCounterKeys)
    assert.match(key, /^[A-Za-z][A-Za-z0-9]*$/);
  assert(Array.isArray(contract.stageTimingLeafKeys) &&
    contract.stageTimingLeafKeys.length > 0);
  assert.equal(new Set(contract.stageTimingLeafKeys).size,
    contract.stageTimingLeafKeys.length);
  for (const key of contract.stageTimingLeafKeys)
    assert.match(key, /^[A-Za-z][A-Za-z0-9]*$/);
  exactKeys(contract.provenanceByImplementation, ["pari", "sagejs"],
    "implementation provenance authority");
  for (const implementation of ["sagejs", "pari"])
    validateImplementationProvenance(
      contract.provenanceByImplementation[implementation], implementation);
  exactKeys(contract.cpuPolicy, ["pari", "sagejs"], "CPU policy");
  for (const implementation of ["sagejs", "pari"]) {
    const policy = contract.cpuPolicy[implementation];
    exactKeys(policy, ["authorities", "availability"],
      `${implementation} CPU policy`);
    assert(["required", "optional"].includes(policy.availability));
    assert(Array.isArray(policy.authorities) && policy.authorities.length > 0);
    assert.equal(new Set(policy.authorities).size, policy.authorities.length);
  }
  assert.equal(contract.cpuPolicy.sagejs.availability, "required");
  assert.deepEqual(contract.cpuPolicy.sagejs.authorities,
    ["process-thread-self"]);
  assert.equal(contract.cpuPolicy.pari.availability, "optional");
  for (const authority of contract.cpuPolicy.pari.authorities)
    assert(["pari-child-rusage", "unavailable-parent-cannot-measure-child"]
      .includes(authority), `untrusted PARI CPU authority ${authority}`);
  for (const key of ["nativeCallObservationSchema",
    "stateEnvelopeSchema", "terminalStateSchema", "precisionStateSchema",
    "retryStateSchema", "workObservationSchema"].filter(key =>
    Object.hasOwn(contract, key))) assert.equal(typeof contract[key], "string");
  authenticateFile(correctness.evidence, "Sage.js correctness evidence");
  authenticateFile(correctness.verifier, "Sage.js correctness verifier");
  authenticateFile(matched.verifier, "matched sample verifier");
  assert.equal(typeof correctness.verifier.exportName, "string");
  assert.equal(typeof matched.verifier.exportName, "string");
  // Unlike diagnostic module checks, trusted v2 evidence authentication can
  // never be bypassed through a validation option.
  const verifierModule = require(correctness.verifier.modulePath);
  const verifier = verifierModule[correctness.verifier.exportName];
  assert.equal(typeof verifier, "function", "v2 evidence verifier is missing");
  const sampleVerifierModule = require(matched.verifier.modulePath);
  assert.equal(typeof sampleVerifierModule[matched.verifier.exportName],
    "function", "v2 matched-sample verifier is missing");
  const evidence = JSON.parse(fs.readFileSync(correctness.evidence.modulePath,
    "utf8"));
  const verdict = verifier(evidence);
  assert(verdict && typeof verdict === "object" && !Array.isArray(verdict),
    "v2 evidence verifier returned no verdict");
  exactKeys(verdict, ["coverage", "evidenceSchema", "leanSemanticDigest",
    "matchedReady", "mutationCoverage", "mutationMechanisms", "panelIndex",
    "replaySha256", "sourceOwnerArithmeticMutations"],
  "v2 verifier verdict");
  assert.equal(verdict.panelIndex, registration.panelIndex);
  assert.equal(verdict.evidenceSchema, correctness.evidence.schema);
  assert.equal(verdict.matchedReady, true);
  assert.equal(verdict.leanSemanticDigest, correctness.leanSemanticDigest,
    "correctness verifier lean semantics differ from trust authority");
  assert.match(verdict.replaySha256, SHA256,
    "correctness verifier omitted source-backed replay authority");
  assert.deepEqual(verdict.coverage, correctness.coverage);
  exactKeys(verdict.mutationCoverage, MUTATION_FAMILIES,
    "Sage.js correctness mutation coverage");
  for (const name of MUTATION_FAMILIES)
    assert.equal(verdict.mutationCoverage[name], true,
      `Sage.js correctness evidence lacks mutation ${name}`);
  exactKeys(verdict.mutationMechanisms, MUTATION_FAMILIES,
    "Sage.js correctness mutation mechanisms");
  for (const name of MUTATION_FAMILIES)
    assert.equal(verdict.mutationMechanisms[name],
      "authenticated-envelope-rejection");
  exactKeys(verdict.sourceOwnerArithmeticMutations,
    ["classPrincipalWitness", "compactUnitEquation", "generalIdealMaps",
      "rawPrincipalEquation", "regulatorLogLattice", "signedGeneratorEquation",
      "smithRelation"],
  "source-owner arithmetic mutations");
  for (const accepted of Object.values(verdict.sourceOwnerArithmeticMutations))
    assert.equal(accepted, true,
      "source-owner arithmetic mutation was not rejected");
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

function leanSemanticProjection(output) {
  return {
    field: output.field,
    classGroup: output.matchedState.classGroup,
    unitGroup: output.matchedState.unitGroup,
    regulator: output.matchedState.regulator,
    torsion: output.matchedState.torsion,
    terminal: output.matchedState.terminal,
  };
}

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

function validateMatchedSampleShape({ registration, capability, implementation,
  verified }) {
  assert(["sagejs", "pari"].includes(implementation),
    "v2 sample implementation is invalid");
  exactKeys(verified, ["observations", "sample"], "v2 verifier result");
  const { observations, sample } = verified;
  exactKeys(sample, ["counters", "cpu", "kernelNanoseconds", "output",
    "peakRssKiB", "resourceCounters", "rng", "stageTiming"],
  "v2 matched sample");
  for (const [label, value] of [["kernelNanoseconds", sample.kernelNanoseconds],
    ["peakRssKiB", sample.peakRssKiB]]) positiveIntegerString(value, label);

  exactKeys(sample.output, ["field", "matchedState", "provenance", "schema"],
    "v2 matched output");
  assert.equal(sample.output.schema, registration.matchedOutputSchema);
  exactKeys(sample.output.field, ["id", "polynomialAscending"],
    "v2 output field");
  assert.equal(sample.output.field.id, registration.fieldId);
  assert.deepEqual(sample.output.field.polynomialAscending,
    registration.expectedDiagnosticProjection.field.polynomialAscending,
    "v2 output polynomial differs from the central field definition");
  const state = sample.output.matchedState;
  exactKeys(state, ["classGroup", "precision", "regulator", "retry",
    "terminal", "torsion", "unitGroup"], "v2 complete matched state");
  exactKeys(state.classGroup,
    ["classNumber", "generatorIdealHnfs", "invariantFactors"],
    "v2 timed class group");
  positiveIntegerString(state.classGroup.classNumber, "class number");
  assert.equal(state.classGroup.classNumber,
    registration.expectedWorkMetadata.classNumber,
    "class number differs from the central field expectation");
  assert(Array.isArray(state.classGroup.invariantFactors));
  assert.deepEqual(state.classGroup.invariantFactors,
    registration.expectedDiagnosticProjection.classGroup.invariantFactors,
    "class invariants differ from the central field expectation");
  let invariantProduct = 1n;
  for (const [index, factor] of state.classGroup.invariantFactors.entries()) {
    positiveIntegerString(factor, "class invariant factor");
    assert(BigInt(factor) > 1n, "class invariant factors must be nontrivial");
    if (index > 0) {
      const previous = BigInt(state.classGroup.invariantFactors[index - 1]);
      assert.equal(BigInt(factor) % previous, 0n,
        "class invariant factors must form a divisibility chain");
    }
    invariantProduct *= BigInt(factor);
  }
  assert.equal(invariantProduct, BigInt(state.classGroup.classNumber),
    "class invariant factors do not multiply to the class number");
  assert(Array.isArray(state.classGroup.generatorIdealHnfs),
    "class generator ideals must be an array");
  assert.equal(state.classGroup.generatorIdealHnfs.length,
    state.classGroup.invariantFactors.length,
    "class generator ideal count differs from class invariants");
  const degree = Number(registration.expectedWorkMetadata.degree);
  for (const [generatorIndex, ideal] of
    state.classGroup.generatorIdealHnfs.entries()) {
    assert(Array.isArray(ideal) && ideal.length === degree,
      `class generator ideal ${generatorIndex} has the wrong row count`);
    for (const row of ideal) {
      assert(Array.isArray(row) && row.length === degree,
        `class generator ideal ${generatorIndex} has the wrong column count`);
      for (const cell of row)
        assert.match(cell, /^-?(0|[1-9][0-9]*)$/,
          "class generator ideal entry is not canonical");
    }
  }
  exactKeys(state.unitGroup, ["basis", "mode", "notGivenState", "rank"],
    "v2 unit group");
  nonnegativeIntegerString(state.unitGroup.rank, "unit rank");
  assert.equal(state.unitGroup.rank, registration.expectedWorkMetadata.unitRank,
    "unit rank differs from the central field expectation");
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
  exactKeys(state.regulator, ["value"], "v2 regulator");
  assert.notEqual(state.regulator.value, null);
  exactKeys(state.torsion, ["generator", "order"], "v2 torsion");
  positiveIntegerString(state.torsion.order, "torsion order");
  assert.equal(state.torsion.order,
    registration.expectedDiagnosticProjection.unitGroup.torsionOrder,
    "torsion order differs from the central field expectation");
  assert.notEqual(state.torsion.generator, null, "torsion generator is missing");
  const contract = capability.matchedSample.contract;
  validateState(state.terminal, contract.terminalStateSchema, "terminal state");
  validateState(state.precision, contract.precisionStateSchema, "precision state");
  validateState(state.retry, contract.retryStateSchema, "retry state");
  const expectedProvenance =
    contract.provenanceByImplementation[implementation];
  validateImplementationProvenance(expectedProvenance, implementation);
  assert.deepEqual(sample.output.provenance, expectedProvenance,
    "output provenance differs from implementation-specific authority");
  assert.equal(digest(leanSemanticProjection(sample.output)),
    capability.sageCorrectness.leanSemanticDigest,
    "timed lean semantics differ from authenticated Sage.js correctness");

  exactKeys(sample.counters, contract.workCounterKeys, "observed work counters");
  for (const [name, value] of Object.entries(sample.counters))
    nonnegativeIntegerString(value, `observed work counter ${name}`);
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
  if (implementation === "sagejs" && registration.panelIndex === 14) {
    exactKeys(observations.provenance, ["declared", "liveNative"],
      "row-14 Sage provenance observation");
    assert.deepEqual(observations.provenance.declared, expectedProvenance,
      "declared provenance differs from implementation-specific authority");
    const live = observations.provenance.liveNative;
    row14NativeProvenance.verifyRow14LiveNativeProvenance(live);
  } else assert.deepEqual(observations.provenance, expectedProvenance,
    "observed provenance differs from implementation-specific authority");

  const cpuPolicy = contract.cpuPolicy[implementation];
  assert.equal(sample.cpu.schema, CPU_OBSERVATION_SCHEMA);
  if (sample.cpu.availability === "available") {
    exactKeys(sample.cpu,
      ["authority", "availability", "nanoseconds", "schema"],
      "available CPU observation");
    nonnegativeIntegerString(sample.cpu.nanoseconds, "CPU nanoseconds");
  } else {
    exactKeys(sample.cpu,
      ["authority", "availability", "reason", "schema"],
      "unavailable CPU observation");
    assert.equal(sample.cpu.availability, "unavailable");
    assert.equal(cpuPolicy.availability, "optional",
      `${implementation} CPU observation is required`);
    assert.equal(typeof sample.cpu.reason, "string");
    assert(sample.cpu.reason.length > 0);
  }
  assert(cpuPolicy.authorities.includes(sample.cpu.authority),
    `${implementation} CPU observation has no authority`);
  if (implementation === "pari" && sample.cpu.availability === "available")
    assert.equal(sample.cpu.authority, "pari-child-rusage",
      "parent thread CPU cannot measure the PARI child");

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
  exactKeys(sample.stageTiming.leaves, contract.stageTimingLeafKeys,
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

function validateMatchedSampleV2({ registration, capability, implementation,
  verified }) {
  const centralRegistration = REGISTERED.find(value =>
    value.panelIndex === registration.panelIndex);
  assert.equal(registration, centralRegistration,
    "live v2 sample registration is not the central registry authority");
  const trusted = TRUSTED_V2_ADMISSIONS.find(value =>
    value.panelIndex === registration.panelIndex);
  assert(trusted,
    `row ${registration.panelIndex} has no centrally trusted v2 admission`);
  assert.equal(capability, trusted,
    "live sample capability differs from central authority");
  return validateMatchedSampleShape({ registration, capability,
    implementation, verified });
}

// This pure shape checker supports focused evidence-contract tests. It cannot
// register an adapter or confer runtime trust: only validateMatchedSampleV2()
// consults the closed-over production trust root and can admit a live sample.
function validateMatchedSampleForAudit(value) {
  return validateMatchedSampleShape(value);
}

// Like validateMatchedSampleForAudit(), this exercises trust-index invariants
// without altering or replacing the closed-over production trust root.
function validateTrustIndexSetsForAudit(definitionRows, trustedRows,
  dispatchableRows = definitionRows) {
  return validateTrustIndexSets(definitionRows, trustedRows, dispatchableRows);
}

function diagnosticAdmission() { return { status: "diagnostic-only",
  matchedReady: false, freshCorrectness: true,
  sagePreparedKernelTiming: false, pariPreparedKernelTiming: false,
  commonSemanticProjection: false, mutuallyExclusiveStageTiming: false,
  stageAttribution: "not-admitted",
  missingCapabilities: [...REQUIRED_CAPABILITIES] }; }

function matchedAdmission() { return { status: "v2-evidence-verified",
  matchedReady: true, freshCorrectness: true,
  sagePreparedKernelTiming: true, pariPreparedKernelTiming: true,
  commonSemanticProjection: true, mutuallyExclusiveStageTiming: true,
  stageAttribution: "inclusive-root-with-explicit-unattributed-remainder",
  missingCapabilities: [] }; }

function validateRegistration(value, options = {}) {
  exactKeys(value, ["adapters", "admission", "admissionCapability", "boundary",
    "diagnosticProjectionSchema", "expectedDiagnosticProjection",
    "expectedWorkMetadata", "fieldId", "matchedOutputSchema", "panelIndex",
    "requirements", "schema"],
  "prepared adapter registration");
  assert.equal(value.schema, REGISTRATION_SCHEMA);
  assert(Number.isSafeInteger(value.panelIndex) && value.panelIndex >= 0);
  assert.equal(value.boundary, "prepared-kernel");
  assert.equal(value.expectedDiagnosticProjection.schema,
    value.diagnosticProjectionSchema,
    "expected diagnostic projection schema differs from registration");
  assert.equal(value.expectedDiagnosticProjection.field.id, value.fieldId,
    "expected diagnostic projection field differs from registration");
  const polynomial = value.expectedDiagnosticProjection.field.polynomialAscending;
  assert(Array.isArray(polynomial), "central polynomial must be an array");
  assert.equal(polynomial.length,
    Number(value.expectedWorkMetadata.degree) + 1,
    "central polynomial degree differs from expected work metadata");
  for (const coefficient of polynomial)
    assert.match(coefficient, /^-?(0|[1-9][0-9]*)$/,
      "central polynomial coefficient is not canonical");
  assert.notEqual(polynomial.at(-1), "0", "central polynomial leading term is zero");
  exactKeys(value.adapters, ["pari", "sagejs"], "adapter pair");
  exactKeys(value.requirements, ["pari", "sagejs"], "implementation requirements");
  for (const implementation of ["sagejs", "pari"]) {
    const adapter = worker.validateDescriptor(value.adapters[implementation]);
    assert.equal(adapter.implementation, implementation);
    assert.equal(adapter.projectionSchema,
      value.matchedOutputSchema ?? value.diagnosticProjectionSchema,
      `${implementation} adapter schema differs from registration`);
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
    assert.equal(value.matchedOutputSchema, null,
      "diagnostic row cannot claim a matched-output schema");
    assert.deepEqual(value.admission, diagnosticAdmission());
  } else {
    assert.equal(value.admissionCapability,
      TRUSTED_V2_ADMISSIONS.find(item => item.panelIndex === value.panelIndex),
      "registration did not consume the central trust entry exactly");
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
  if (entries === REGISTERED) {
    const consumed = validated.filter(value => value.admissionCapability !== null)
      .map(value => value.admissionCapability);
    assert.equal(consumed.length, TRUSTED_V2_ADMISSIONS.length,
      "central trust root was not consumed exactly");
    for (const capability of TRUSTED_V2_ADMISSIONS)
      assert.equal(consumed.filter(value => value === capability).length, 1,
        `trusted row ${capability.panelIndex} was not consumed exactly once`);
  }
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
    diagnosticProjectionSchema: value.diagnosticProjectionSchema,
    matchedOutputSchema: value.matchedOutputSchema,
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

module.exports = { CAPABILITY_SCHEMA, CORRECTNESS_COVERAGE_KEYS,
  COVERAGE_KEYS, CPU_OBSERVATION_SCHEMA, FACTORY, MUTATION_FAMILIES,
  DISPATCHABLE_PANEL_INDICES, PROVENANCE_MANIFEST_SCHEMA, REGISTERED,
  REGISTRATION_SCHEMA,
  REGISTRY_SCHEMA, REQUIRED_CAPABILITIES, TRUSTED_V2_ADMISSIONS, WRAPPER_PATH,
  diagnosticPreparedAdapterRegistration, inventory, preparedAdapterRegistration,
  validateCapability, validateMatchedSampleForAudit, validateMatchedSampleV2,
  validateRegistration, validateRegistry, validateTrustIndexSetsForAudit };

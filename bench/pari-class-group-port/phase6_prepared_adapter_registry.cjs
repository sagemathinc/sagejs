"use strict";

// Static, field-neutral admission registry for real Phase-6 prepared-kernel
// adapter pairs.  Registration proves that both implementations expose the
// worker protocol and one common semantic projection.  It does not enable a
// campaign, open reserves, approve a timing host, or execute mathematics.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const worker = require("./qualification_arm_worker.cjs");

const REGISTRY_SCHEMA =
  "sagejs.pari-class-group/phase6-prepared-adapter-registry-v1";
const REGISTRATION_SCHEMA =
  "sagejs.pari-class-group/phase6-prepared-adapter-registration-v1";
const WRAPPER_PATH = path.join(__dirname,
  "phase6_registered_prepared_adapter.cjs");
const FACTORY = "createRegisteredPreparedAdapter";

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
    panelIndex: 0,
    expectedProjection: commonCubic({ row: 0,
      id: "pari-2.17.4:x^3-20018*x+20034",
      polynomial: ["20034", "-20018", "0", "1"],
      classNumber: "1", invariants: [] }),
    workCounters: { classNumber: "1", degree: "3", unitRank: "2" },
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
    workCounters: { classNumber: "3", degree: "3", unitRank: "2" },
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
    workCounters: { classNumber: "6", degree: "3", unitRank: "2" },
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
    workCounters: { classNumber: "2", degree: "3", unitRank: "2" },
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
    workCounters: { classNumber: "192", degree: "4", unitRank: "2" },
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
    workCounters: { classNumber: "27", degree: "3", unitRank: "1" },
    sage: ["row16_phase6_sage_prepared_adapter.cjs", ["prepareResident",
      "runResident", "semanticProjection"]],
    pari: ["row16_phase6_pari_prepared_adapter.cjs", ["Client",
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
    workCounters: deepFreeze({ ...definition.workCounters }),
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
    admission: Object.freeze({ freshCorrectness: true,
      sagePreparedKernelTiming: true, pariPreparedKernelTiming: true,
      commonSemanticProjection: true, mutuallyExclusiveStageTiming: true,
      stageAttribution: "inclusive-root-with-explicit-unattributed-remainder" }),
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

function validateRegistration(value, options = {}) {
  exactKeys(value, ["adapters", "admission", "boundary", "expectedProjection",
    "fieldId", "panelIndex", "projectionSchema", "requirements", "schema",
    "workCounters"], "prepared adapter registration");
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
  assert.deepEqual(Object.keys(value.workCounters).sort(),
    ["classNumber", "degree", "unitRank"]);
  for (const item of Object.values(value.workCounters))
    assert.match(item, /^(0|[1-9][0-9]*)$/);
  assert.deepEqual(value.admission, {
    freshCorrectness: true,
    sagePreparedKernelTiming: true,
    pariPreparedKernelTiming: true,
    commonSemanticProjection: true,
    mutuallyExclusiveStageTiming: true,
    stageAttribution: "inclusive-root-with-explicit-unattributed-remainder",
  });
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
  const found = REGISTERED.find(value => value.panelIndex === panelIndex);
  assert(found, `development row ${panelIndex} has no prepared adapter pair`);
  return validateRegistration(found);
}

function inventory(entries = REGISTERED, options = {}) {
  const registered = validateRegistry(entries, options);
  return Object.freeze({
    schema: REGISTRY_SCHEMA,
    executionEnabled: false,
    reserveOpeningEnabled: false,
    rows: Object.freeze(registered.map(value => Object.freeze({
      panelIndex: value.panelIndex,
      fieldId: value.fieldId,
      projectionSchema: value.projectionSchema,
      ...value.admission,
    }))),
  });
}

module.exports = { FACTORY, REGISTERED, REGISTRATION_SCHEMA, REGISTRY_SCHEMA,
  WRAPPER_PATH, inventory, preparedAdapterRegistration, validateRegistration,
  validateRegistry };

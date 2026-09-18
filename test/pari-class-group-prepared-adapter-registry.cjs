"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const registry = require("../bench/pari-class-group-port/phase6_prepared_adapter_registry.cjs");
const wrapper = require("../bench/pari-class-group-port/phase6_registered_prepared_adapter.cjs");

const copy = value => structuredClone(value);

test("the first symmetric prepared-adapter wave is admitted statically", () => {
  const inventory = registry.inventory();
  assert.equal(inventory.executionEnabled, false);
  assert.equal(inventory.reserveOpeningEnabled, false);
  assert.deepEqual(inventory.rows.map(row => row.panelIndex),
    [0, 1, 3, 4, 8, 10, 11, 14, 16, 18, 20, 23]);
  assert(Object.isFrozen(registry.REGISTERED[0].expectedProjection));
  assert(Object.isFrozen(registry.REGISTERED[0].expectedProjection.field));
  assert(inventory.rows.every(row => row.sagePreparedKernelTiming &&
    row.pariPreparedKernelTiming && row.commonSemanticProjection &&
    row.mutuallyExclusiveStageTiming));
});

test("the generic PARI wave shares exact neutral projections", () => {
  const expected = {
    8: ["1", [], "2"],
    10: ["4", ["2", "2"], "2"],
    11: ["4", ["2", "2"], "2"],
    18: ["18", ["18"], "1"],
    20: ["1", [], "2"],
  };
  for (const [row, [classNumber, invariants, rank]] of
    Object.entries(expected)) {
    const projection = registry.preparedAdapterRegistration(Number(row))
      .expectedProjection;
    assert.equal(projection.classGroup.classNumber, classNumber);
    assert.deepEqual(projection.classGroup.invariantFactors, invariants);
    assert.equal(projection.unitGroup.rank, rank);
    assert.match(projection.schema, /neutral-exact-projection-v1$/);
  }
});

test("row 23 admits the same neutral quintic class-and-unit projection", () => {
  const admitted = registry.preparedAdapterRegistration(23);
  assert.deepEqual(admitted.expectedProjection, {
    schema: "sagejs.pari-class-group/row23-phase6-common-projection-v1",
    field: { id: "5.5.1002836007889.1",
      polynomialAscending: ["341", "-970", "772", "-141", "-2", "1"] },
    classGroup: { classNumber: "6", invariantFactors: ["6"] },
    unitGroup: { rank: "4", regulatorPresent: true, torsionOrder: "2" },
    completionMode: "flag-zero-class-and-unit-result",
  });
  assert.equal(admitted.workCounters.degree, "5");
  assert.equal(admitted.workCounters.unitRank, "4");
});

test("registration rejects an incomplete implementation pair", () => {
  const incomplete = copy(registry.REGISTERED[0]);
  delete incomplete.adapters.pari;
  assert.throws(() => registry.validateRegistration(incomplete), /adapter pair/);
});

test("registration rejects mismatched schemas and fields", () => {
  const schema = copy(registry.REGISTERED[0]);
  schema.adapters.pari.projectionSchema = "wrong";
  assert.throws(() => registry.validateRegistration(schema),
    /pari projection schema differs/);
  const field = copy(registry.REGISTERED[0]);
  field.expectedProjection.field.id = "different-field";
  assert.throws(() => registry.validateRegistration(field),
    /expected projection field differs/);
});

test("registration rejects missing exports, files, and duplicate rows", () => {
  const missingExport = copy(registry.REGISTERED[0]);
  missingExport.requirements.sagejs.exports = ["notAnExport"];
  assert.throws(() => registry.validateRegistration(missingExport),
    /lacks notAnExport/);
  const missingFile = copy(registry.REGISTERED[0]);
  missingFile.requirements.pari.modulePath = "/does/not/exist.cjs";
  assert.throws(() => registry.validateRegistration(missingFile),
    /module is missing/);
  assert.throws(() => registry.validateRegistry([
    registry.REGISTERED[0], registry.REGISTERED[0],
  ]), /duplicate panel indices/);
});

test("row 3 down-projection drops only stronger retained evidence", () => {
  const expected = copy(registry.preparedAdapterRegistration(3).expectedProjection);
  const stronger = copy(expected);
  stronger.schema = "sagejs.pari-class-group/row3-phase6-class-unit-projection-v1";
  stronger.unitGroup.materialization = "not_given(LARGE)";
  stronger.unitGroup.factoredTransformRetained = true;
  stronger.unitGroup.rawRelationProvenanceRetained = true;
  stronger.completionMode =
    "flag-zero-class-and-compact-unit-provenance-result";
  assert.deepEqual(wrapper.downProject(3, "sagejs", stronger, expected), expected);
  const wrong = copy(stronger);
  wrong.classGroup.classNumber = "7";
  assert.throws(() => wrapper.downProject(3, "sagejs", wrong, expected),
    /common projection changed/);
});

test("generic-wave Sage projections discard only reviewed stronger fields", () => {
  const row8 = copy(registry.preparedAdapterRegistration(8).expectedProjection);
  const source8 = copy(row8);
  source8.schema = "sagejs.pari-class-group/row8-phase6-common-projection-v1";
  source8.unitGroup.flagZeroStatus = "not_given(PRECI)";
  assert.deepEqual(wrapper.downProject(8, "sagejs", source8, row8), row8);
  source8.classGroup.classNumber = "2";
  assert.throws(() => wrapper.downProject(8, "sagejs", source8, row8));

  const row18 = copy(registry.preparedAdapterRegistration(18).expectedProjection);
  const source18 = copy(row18);
  delete source18.classGroup.generatorCount;
  source18.completionMode = "initial-reject-then-connected-retry";
  assert.deepEqual(wrapper.downProject(18, "sagejs", source18, row18), row18);

  const row20 = copy(registry.preparedAdapterRegistration(20).expectedProjection);
  const source20 = { classGroup: copy(row20.classGroup),
    unitGroup: { ...copy(row20.unitGroup), coordinates: ["1"], norms: ["1"] },
    correspondenceComplete: true };
  assert.deepEqual(wrapper.downProject(20, "sagejs", source20, row20), row20);
  source20.correspondenceComplete = false;
  assert.throws(() => wrapper.downProject(20, "sagejs", source20, row20));
});

test("protocol normalization retains disabled execution and honest stage remainder", () => {
  const admitted = registry.preparedAdapterRegistration(0);
  const started = process.threadCpuUsage();
  const sample = wrapper.normalizedSample({ panelIndex: 0,
    implementation: "sagejs",
    request: { boundary: "prepared-kernel", fieldId: admitted.fieldId,
      seed: "1" }, raw: { kernelNanoseconds: "17" },
    projection: copy(admitted.expectedProjection),
    counters: admitted.workCounters, threadStarted: started });
  assert.equal(sample.stageTiming.inclusiveNanoseconds, "17");
  assert.equal(sample.stageTiming.unattributedNanoseconds, "17");
  assert.deepEqual(Object.values(sample.stageTiming.leaves), ["0", "0", "0", "0"]);
  assert.deepEqual(sample.rng, { scope: "matched-input-seed-only", seed: "1",
    terminalStateMaterialized: false });
});

test("generic-wave native-call accounting is explicit and fail-closed", () => {
  assert.equal(wrapper.explicitNativeCalls(
    { resourceCounters: { nativeCalls: "7" } }), "7");
  assert.equal(wrapper.explicitNativeCalls(
    { executionBoundary: { nativeCallsInsideClock: 1 } }), "1");
  assert.equal(wrapper.explicitNativeCalls(
    { boundary: { nativeCallsInsideClock: 1 } }), "1");
  assert.throws(() => wrapper.explicitNativeCalls({}), /lacks an explicit/);
  assert.throws(() => wrapper.explicitNativeCalls({ resourceCounters:
    { nativeCalls: "2" }, boundary: { nativeCallsInsideClock: 1 } }),
  /disagree/);

  const admitted = registry.preparedAdapterRegistration(18);
  assert.throws(() => wrapper.normalizedSample({ panelIndex: 18,
    implementation: "sagejs",
    request: { boundary: "prepared-kernel", fieldId: admitted.fieldId,
      seed: "1" }, raw: { kernelNanoseconds: "17" },
    projection: copy(admitted.expectedProjection),
    counters: admitted.workCounters, threadStarted: process.threadCpuUsage() }),
  /lacks an explicit/);

  const legacy = registry.preparedAdapterRegistration(14);
  const normalized = wrapper.normalizedSample({ panelIndex: 14,
    implementation: "sagejs",
    request: { boundary: "prepared-kernel", fieldId: legacy.fieldId,
      seed: "1" }, raw: { kernelNanoseconds: "17" },
    projection: copy(legacy.expectedProjection),
    counters: legacy.workCounters, threadStarted: process.threadCpuUsage() });
  assert.equal(normalized.resourceCounters.mathematicalCalls, "1",
    "pre-wave registrations retain their separately audited legacy value");
});

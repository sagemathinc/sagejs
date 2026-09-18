"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const registry = require("../bench/pari-class-group-port/phase6_prepared_adapter_registry.cjs");
const wrapper = require("../bench/pari-class-group-port/phase6_registered_prepared_adapter.cjs");
const retiredGenericSmoke = require("../bench/pari-class-group-port/check_phase6_generic_pari_wave_smoke.cjs");

const copy = value => structuredClone(value);
const DIAGNOSTIC_ROWS = [0, 1, 3, 4, 8, 10, 11, 14, 16, 18, 19, 20, 23];

test("v2 inventory fails closed while retaining diagnostic implementations", () => {
  const inventory = registry.inventory();
  assert.equal(inventory.schema,
    "sagejs.pari-class-group/phase6-prepared-adapter-registry-v2");
  assert.equal(inventory.executionEnabled, false);
  assert.equal(inventory.reserveOpeningEnabled, false);
  assert.deepEqual(inventory.rows, []);
  assert.deepEqual(inventory.diagnosticRows.map(row => row.panelIndex),
    DIAGNOSTIC_ROWS);
  for (const row of inventory.diagnosticRows) {
    assert.equal(row.status, "diagnostic-only");
    assert.equal(row.matchedReady, false);
    assert.equal(row.sagePreparedKernelTiming, false);
    assert.equal(row.pariPreparedKernelTiming, false);
    assert.equal(row.commonSemanticProjection, false);
    assert.deepEqual(row.missingCapabilities, registry.REQUIRED_CAPABILITIES);
  }
});

test("legacy projections and expected work are diagnostic metadata only", () => {
  const row = registry.diagnosticPreparedAdapterRegistration(14);
  assert.equal(row.admissionCapability, null);
  assert.equal(row.expectedProjection.classGroup.classNumber, "192");
  assert.deepEqual(row.expectedWorkMetadata,
    { classNumber: "192", degree: "4", unitRank: "2" });
  assert(Object.isFrozen(row.expectedProjection));
  assert(Object.isFrozen(row.admission.missingCapabilities));
  assert.throws(() => registry.preparedAdapterRegistration(14),
    /diagnostic-only; missing v2 capabilities: row-specific-evidence-verifier/);
});

test("self-asserted v2 capabilities cannot create production trust", () => {
  assert.deepEqual(registry.TRUSTED_V2_ADMISSIONS, []);
  assert(Object.isFrozen(registry.TRUSTED_V2_ADMISSIONS));
  assert.deepEqual(registry.REQUIRED_CAPABILITIES, [
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
  const row = copy(registry.REGISTERED[0]);
  row.admissionCapability = { schema: registry.CAPABILITY_SCHEMA,
    panelIndex: row.panelIndex, fieldId: row.fieldId,
    projectionSchema: row.projectionSchema,
    evidence: { schema:
      `sagejs.pari-class-group/row${row.panelIndex}-phase6-matched-state-evidence-v2`,
    modulePath: __filename, sha256: "0".repeat(64) },
    verifier: { modulePath: __filename, evidenceExportName: "verifyEvidence",
      sampleExportName: "verifySample", sha256: "0".repeat(64) },
    sampleContract: { mutationNames: [...registry.MUTATION_FAMILIES],
      workCounterKeys: ["relations"],
      replaySchema: "untrusted-replay", terminalStateSchema: "untrusted-terminal",
      precisionStateSchema: "untrusted-precision", retryStateSchema: "untrusted-retry",
      stateEnvelopeSchema: "untrusted-state-envelope",
      workObservationSchema: "untrusted-work-observation",
      nativeCallObservationSchema: "untrusted-native-observation",
      provenance: { adapterSha256: "0".repeat(64), cacheSha256: "0".repeat(64),
        coreSha256: "0".repeat(64), sourceSha256: "0".repeat(64) } },
    coverage: Object.fromEntries(registry.COVERAGE_KEYS.map(key => [key, true])) };
  row.admission = { status: "v2-evidence-verified", matchedReady: true,
    freshCorrectness: true, sagePreparedKernelTiming: true,
    pariPreparedKernelTiming: true, commonSemanticProjection: true,
    mutuallyExclusiveStageTiming: true,
    stageAttribution: "inclusive-root-with-explicit-unattributed-remainder",
    missingCapabilities: [] };
  assert.throws(() => registry.validateRegistration(row, { loadModules: false }),
    /has no centrally trusted v2 admission/);
  const wrongRowSchema = copy(row);
  wrongRowSchema.admissionCapability.evidence.schema =
    "sagejs.pari-class-group/row999-phase6-matched-state-evidence-v2";
  assert.throws(() => registry.validateRegistration(wrongRowSchema,
    { loadModules: false }), /evidence schema must be bound/);
  assert.throws(() => registry.validateMatchedSampleV2({ registration: row,
    capability: row.admissionCapability, verified: {} }),
  /not the central registry authority/);

  row.admissionCapability = null;
  assert.throws(() => registry.validateRegistration(row));
});

test("registration still rejects incomplete implementation diagnostics", () => {
  const incomplete = copy(registry.REGISTERED[0]);
  delete incomplete.adapters.pari;
  assert.throws(() => registry.validateRegistration(incomplete), /adapter pair/);

  const missingExport = copy(registry.REGISTERED[0]);
  missingExport.requirements.sagejs.exports = ["notAnExport"];
  assert.throws(() => registry.validateRegistration(missingExport),
    /lacks notAnExport/);
  assert.throws(() => registry.validateRegistry([
    registry.REGISTERED[0], registry.REGISTERED[0],
  ]), /duplicate panel indices/);
});

test("runtime factory cannot execute a diagnostic-only row", async () => {
  await assert.rejects(() => wrapper.createRegisteredPreparedAdapter(
    { panelIndex: 14, implementation: "sagejs" }),
  /diagnostic-only; missing v2 capabilities/);
});

test("retired generic-PARI smoke cannot launch shallow legacy pair work", async () => {
  const output = path.join(os.tmpdir(),
    `retired-phase6-generic-smoke-${process.pid}.json`);
  fs.rmSync(output, { force: true });
  await assert.rejects(() => retiredGenericSmoke.main([output, "8,20"]),
    error => {
      assert.match(error.message,
        /retired shallow Phase 6 generic-PARI smoke cannot launch mathematical arms/);
      assert.match(error.message, /row-specific-evidence-verifier/);
      return true;
    });
  assert.equal(fs.existsSync(output), false,
    "retired smoke must fail before writing a receipt");
  const diagnostic = retiredGenericSmoke.retiredDiagnostic([8]);
  assert.equal(diagnostic[0].status, "diagnostic-only");
  assert.deepEqual(diagnostic[0].missingCapabilities,
    registry.REQUIRED_CAPABILITIES);
});

test("legacy projection, replay, and counter manufacture is retired", () => {
  assert.throws(() => wrapper.downProject(8, "sagejs", {}, {}),
    /legacy metadata down-projection is disabled/);
  assert.throws(() => wrapper.normalizedSample({ panelIndex: 8,
    implementation: "sagejs" }), /legacy sample normalization is disabled/);
  assert.throws(() => wrapper.explicitNativeCalls({}), /lacks an explicit/);
  assert.equal(wrapper.explicitNativeCalls(
    { resourceCounters: { nativeCalls: "7" } }), "7");
});

test("row 14 remains diagnostic despite its stronger comparison path", () => {
  const row14 = registry.diagnosticPreparedAdapterRegistration(14);
  const timing = require("../bench/pari-class-group-port/row14_sage_prepared_timing_adapter.cjs");
  assert.equal(typeof timing.compareWithPari, "function");
  assert.equal(row14.admission.matchedReady, false);
  assert.deepEqual(row14.admission.missingCapabilities,
    registry.REQUIRED_CAPABILITIES);
});

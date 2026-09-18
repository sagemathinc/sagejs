"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const registry = require("../bench/pari-class-group-port/phase6_prepared_adapter_registry.cjs");
const wrapper = require("../bench/pari-class-group-port/phase6_registered_prepared_adapter.cjs");
const retiredGenericSmoke = require("../bench/pari-class-group-port/check_phase6_generic_pari_wave_smoke.cjs");

const copy = value => structuredClone(value);
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const digest = value => crypto.createHash("sha256").update(canonical(value))
  .digest("hex");
const DIAGNOSTIC_ROWS = [0, 1, 3, 4, 8, 10, 11, 14, 16, 18, 19, 20, 23];

test("v2 inventory admits only reviewed row 14 and retains diagnostics", () => {
  const inventory = registry.inventory();
  assert.equal(inventory.schema,
    "sagejs.pari-class-group/phase6-prepared-adapter-registry-v2");
  assert.equal(inventory.executionEnabled, false);
  assert.equal(inventory.reserveOpeningEnabled, false);
  assert.deepEqual(inventory.rows.map(row => row.panelIndex), [14]);
  assert.equal(inventory.rows[0].status, "v2-evidence-verified");
  assert.equal(inventory.rows[0].matchedReady, true);
  assert.deepEqual(inventory.diagnosticRows.map(row => row.panelIndex),
    DIAGNOSTIC_ROWS);
  for (const row of inventory.diagnosticRows.filter(row => row.panelIndex !== 14)) {
    assert.equal(row.status, "diagnostic-only");
    assert.equal(row.matchedReady, false);
    assert.equal(row.sagePreparedKernelTiming, false);
    assert.equal(row.pariPreparedKernelTiming, false);
    assert.equal(row.commonSemanticProjection, false);
    assert.deepEqual(row.missingCapabilities, registry.REQUIRED_CAPABILITIES);
  }
});

test("legacy projections and expected work remain diagnostic metadata only", () => {
  const row = registry.diagnosticPreparedAdapterRegistration(11);
  assert.equal(row.admissionCapability, null);
  assert.equal(row.expectedDiagnosticProjection.classGroup.classNumber, "4");
  assert.equal(row.diagnosticProjectionSchema,
    "sagejs.pari-class-group/row11-phase6-neutral-exact-projection-v1");
  assert.equal(row.matchedOutputSchema, null);
  assert.deepEqual(row.expectedWorkMetadata,
    { classNumber: "4", degree: "4", unitRank: "2" });
  assert(Object.isFrozen(row.expectedDiagnosticProjection));
  assert(Object.isFrozen(row.admission.missingCapabilities));
  assert.throws(() => registry.preparedAdapterRegistration(11),
    /diagnostic-only; missing v2 capabilities: sage-correctness-evidence-verifier/);
});

test("self-asserted v2 capabilities cannot create production trust", () => {
  assert.deepEqual(registry.TRUSTED_V2_ADMISSIONS.map(value => value.panelIndex),
    [14]);
  assert(Object.isFrozen(registry.TRUSTED_V2_ADMISSIONS));
  assert.deepEqual(registry.REQUIRED_CAPABILITIES, [
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
  const row = copy(registry.REGISTERED[0]);
  row.matchedOutputSchema =
    "sagejs.pari-class-group/test-untrusted-matched-output-v2";
  for (const adapter of Object.values(row.adapters))
    adapter.projectionSchema = row.matchedOutputSchema;
  row.admissionCapability = { schema: registry.CAPABILITY_SCHEMA,
    panelIndex: row.panelIndex, fieldId: row.fieldId,
    matchedOutputSchema: row.matchedOutputSchema,
    sageCorrectness: {}, matchedSample: {} };
  row.admission = { status: "v2-evidence-verified", matchedReady: true,
    freshCorrectness: true, sagePreparedKernelTiming: true,
    pariPreparedKernelTiming: true, commonSemanticProjection: true,
    mutuallyExclusiveStageTiming: true,
    stageAttribution: "inclusive-root-with-explicit-unattributed-remainder",
    missingCapabilities: [] };
  assert.throws(() => registry.validateRegistration(row, { loadModules: false }),
    /did not consume the central trust entry exactly/);
  assert.throws(() => registry.validateMatchedSampleV2({ registration: row,
    capability: row.admissionCapability, implementation: "sagejs",
    verified: {} }),
  /not the central registry authority/);

  row.admissionCapability = null;
  assert.throws(() => registry.validateRegistration(row));
});

test("central trust wiring rejects duplicates and orphans exactly", () => {
  assert.deepEqual(registry.validateTrustIndexSetsForAudit(
    [0, 1, 2], [0, 2], [0, 1, 2]),
    [{ panelIndex: 0, trusted: true }, { panelIndex: 1, trusted: false },
      { panelIndex: 2, trusted: true }]);
  assert.throws(() => registry.validateTrustIndexSetsForAudit(
    [0, 0], [], [0]),
    /definitions have duplicate/);
  assert.throws(() => registry.validateTrustIndexSetsForAudit(
    [0], [0, 0], [0]),
    /admissions have duplicate/);
  assert.throws(() => registry.validateTrustIndexSetsForAudit(
    [0], [1], [0]),
    /orphaned from the inventory/);
  assert.throws(() => registry.validateTrustIndexSetsForAudit(
    [19], [19], []), /no complete wrapper dispatch/);
  assert.equal(registry.DISPATCHABLE_PANEL_INDICES.includes(19), false,
    "row 19 must remain ineligible until both wrapper arms dispatch it");
});

function auditSampleFixture(implementation = "pari") {
  const provenance = name => ({
    schema: registry.PROVENANCE_MANIFEST_SCHEMA,
    implementation: name,
    artifacts: [{ role: name === "sagejs" ? "generated-source" : "pari-helper",
      sha256: (name === "sagejs" ? "a" : "b").repeat(64) }],
  });
  const contract = {
    cpuPolicy: {
      sagejs: { availability: "required", authorities: ["process-thread-self"] },
      pari: { availability: "optional", authorities: ["pari-child-rusage",
        "unavailable-parent-cannot-measure-child"] },
    },
    nativeCallObservationSchema: "test-native-observation-v1",
    precisionStateSchema: "test-precision-v1",
    provenanceByImplementation: {
      sagejs: provenance("sagejs"), pari: provenance("pari"),
    },
    retryStateSchema: "test-retry-v1",
    stageTimingLeafKeys: ["relationRetry", "sparseHnfSnfTransform"],
    stateEnvelopeSchema: "test-state-envelope-v1",
    terminalStateSchema: "test-terminal-v1",
    workCounterKeys: ["relations", "retries"],
    workObservationSchema: "test-work-observation-v1",
  };
  const registration = {
    panelIndex: 999,
    fieldId: "test-field",
    matchedOutputSchema: "sagejs.pari-class-group/test-matched-output-v2",
    expectedDiagnosticProjection: {
      field: { id: "test-field", polynomialAscending: ["8", "0", "1"] },
      classGroup: { classNumber: "8", invariantFactors: ["2", "4"] },
      unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
    },
    expectedWorkMetadata: { classNumber: "8", degree: "2", unitRank: "2" },
  };
  const capability = { matchedSample: { contract }, sageCorrectness: null };
  const workEvidence = { observedRows: [] };
  const nativeEvidence = { nativeBoundaryEntries: [1] };
  const expectedProvenance = contract.provenanceByImplementation[implementation];
  const output = {
    schema: registration.matchedOutputSchema,
    field: { id: registration.fieldId, polynomialAscending: ["8", "0", "1"] },
    matchedState: {
      classGroup: { classNumber: "8", invariantFactors: ["2", "4"],
        generatorIdealHnfs: [
          [["1", "0"], ["0", "1"]],
          [["2", "0"], ["0", "1"]],
        ] },
      unitGroup: { basis: null, mode: "not_given", notGivenState: {
        reason: "large" }, rank: "2" },
      regulator: { value: "1.25" },
      torsion: { generator: "-1", order: "2" },
      terminal: { schema: contract.terminalStateSchema, status: "complete" },
      precision: { schema: contract.precisionStateSchema, bits: "128" },
      retry: { schema: contract.retryStateSchema, count: "0" },
    },
    provenance: expectedProvenance,
  };
  capability.sageCorrectness = { leanSemanticDigest: digest({
    field: output.field,
    classGroup: output.matchedState.classGroup,
    unitGroup: output.matchedState.unitGroup,
    regulator: output.matchedState.regulator,
    torsion: output.matchedState.torsion,
    terminal: output.matchedState.terminal,
  }) };
  const sample = {
    counters: { relations: "0", retries: "0" },
    cpu: implementation === "sagejs"
      ? { schema: registry.CPU_OBSERVATION_SCHEMA, availability: "available",
        authority: "process-thread-self", nanoseconds: "0" }
      : { schema: registry.CPU_OBSERVATION_SCHEMA, availability: "unavailable",
        authority: "unavailable-parent-cannot-measure-child",
        reason: "PARI executed in a child process without child rusage" },
    kernelNanoseconds: "10",
    output,
    peakRssKiB: "1",
    resourceCounters: { nativeCalls: "1" },
    rng: { schema: contract.stateEnvelopeSchema,
      terminal: output.matchedState.terminal,
      precision: output.matchedState.precision,
      retry: output.matchedState.retry },
    stageTiming: { inclusiveNanoseconds: "10",
      leaves: { relationRetry: "0", sparseHnfSnfTransform: "7" },
      unattributedNanoseconds: "3" },
  };
  const verified = {
    sample,
    observations: {
      workCounters: { schema: contract.workObservationSchema,
        derivationEvidence: workEvidence, evidenceDigest: digest(workEvidence),
        values: sample.counters },
      nativeCalls: { schema: contract.nativeCallObservationSchema,
        derivationEvidence: nativeEvidence, evidenceDigest: digest(nativeEvidence),
        value: sample.resourceCounters.nativeCalls },
      provenance: expectedProvenance,
    },
  };
  return { capability, implementation, registration, verified };
}

function refreshLeanSemanticDigest(fixture) {
  const output = fixture.verified.sample.output;
  fixture.capability.sageCorrectness.leanSemanticDigest = digest({
    field: output.field,
    classGroup: output.matchedState.classGroup,
    unitGroup: output.matchedState.unitGroup,
    regulator: output.matchedState.regulator,
    torsion: output.matchedState.torsion,
    terminal: output.matchedState.terminal,
  });
}

test("matched sample shape permits zero work and honest missing PARI CPU", () => {
  const fixture = auditSampleFixture("pari");
  assert.equal(registry.validateMatchedSampleForAudit(fixture),
    fixture.verified.sample);
  assert.equal(Object.hasOwn(
    fixture.verified.sample.output.matchedState.classGroup,
    "generatorIdealHnfs"), true,
  "timed output retains standard generator ideals but not principal witnesses");
  assert.equal(Object.hasOwn(fixture.verified.sample, "replay"), false,
    "full Sage replay belongs to admission evidence, not each timed arm");
});

test("matched sample shape binds field, divisibility, provenance, calls and CPU", () => {
  const mutate = callback => {
    const fixture = auditSampleFixture("pari");
    callback(fixture);
    return () => registry.validateMatchedSampleForAudit(fixture);
  };
  assert.throws(mutate(value => {
    value.verified.sample.output.field.polynomialAscending[0] = "9";
  }), /central field definition/);
  assert.throws(mutate(value => {
    value.verified.sample.output.matchedState.classGroup.invariantFactors = ["8"];
  }), /class invariants differ from the central field expectation/);
  assert.throws(mutate(value => {
    value.verified.sample.output.matchedState.torsion.order = "3";
  }), /torsion order differs from the central field expectation/);
  assert.throws(mutate(value => {
    const factors = ["4", "2"];
    value.verified.sample.output.matchedState.classGroup.invariantFactors = factors;
    value.registration.expectedDiagnosticProjection.classGroup.invariantFactors =
      [...factors];
    refreshLeanSemanticDigest(value);
  }), /divisibility chain/);
  assert.throws(mutate(value => {
    value.verified.sample.output.matchedState.unitGroup.notGivenState.reason =
      "silently-changed";
  }), /timed lean semantics differ from authenticated Sage.js correctness/);
  assert.throws(mutate(value => {
    value.verified.sample.resourceCounters.nativeCalls = "0";
    value.verified.observations.nativeCalls.value = "0";
  }), /native calls must be positive/);
  assert.throws(mutate(value => {
    value.verified.sample.output.provenance =
      value.capability.matchedSample.contract.provenanceByImplementation.sagejs;
  }), /implementation-specific authority/);
  assert.throws(mutate(value => {
    const manifest =
      value.capability.matchedSample.contract.provenanceByImplementation.pari;
    manifest.artifacts.push(copy(manifest.artifacts[0]));
    value.verified.sample.output.provenance = manifest;
    value.verified.observations.provenance = manifest;
  }), /duplicate artifact roles/);
  assert.throws(mutate(value => {
    value.verified.sample.cpu = { schema: registry.CPU_OBSERVATION_SCHEMA,
      availability: "available", authority: "process-thread-self",
      nanoseconds: "1" };
  }), /no authority|parent thread CPU/);
  const sage = auditSampleFixture("sagejs");
  sage.verified.sample.cpu = { schema: registry.CPU_OBSERVATION_SCHEMA,
    availability: "unavailable", authority: "process-thread-self",
    reason: "not measured" };
  assert.throws(() => registry.validateMatchedSampleForAudit(sage),
    /CPU observation is required/);
});

test("registration still rejects incomplete implementation diagnostics", () => {
  const incomplete = copy(registry.REGISTERED[0]);
  delete incomplete.adapters.pari;
  assert.throws(() => registry.validateRegistration(incomplete), /adapter pair/);

  const missingExport = copy(registry.REGISTERED[0]);
  missingExport.requirements.sagejs.exports = ["notAnExport"];
  assert.throws(() => registry.validateRegistration(missingExport),
    /lacks notAnExport/);
  const wrongPolynomial = copy(registry.REGISTERED[0]);
  wrongPolynomial.expectedDiagnosticProjection.field.polynomialAscending =
    ["20034", "-20018", "1"];
  assert.throws(() => registry.validateRegistration(wrongPolynomial,
    { loadModules: false }), /polynomial degree differs/);
  assert.throws(() => registry.validateRegistry([
    registry.REGISTERED[0], registry.REGISTERED[0],
  ]), /duplicate panel indices/);
});

test("runtime factory cannot execute a diagnostic-only row", async () => {
  await assert.rejects(() => wrapper.createRegisteredPreparedAdapter(
    { panelIndex: 0, implementation: "sagejs" }),
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
      assert.match(error.message, /sage-correctness-evidence-verifier/);
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

test("row 14 is the sole strict-v2 admission", () => {
  const row14 = registry.preparedAdapterRegistration(14);
  const timing = require("../bench/pari-class-group-port/row14_sage_prepared_timing_adapter.cjs");
  assert.equal(typeof timing.compareWithPari, "function");
  assert.equal(row14.admission.matchedReady, true);
  assert.equal(row14.admission.status, "v2-evidence-verified");
  assert.deepEqual(row14.admission.missingCapabilities, []);
  assert.equal(row14.admissionCapability.panelIndex, 14);
});

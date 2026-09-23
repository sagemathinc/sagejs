// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const checker = require("../bench/pari-class-group-port/check_row21_phase6_qualification_pair.cjs");
const neutral = require("../bench/pari-class-group-port/class_unit_correspondence_result.cjs");
const pari = require("../bench/pari-class-group-port/row21_phase6_pari_prepared_adapter.cjs");
const sage = require("../bench/pari-class-group-port/row21_phase6_sage_prepared_adapter.cjs");
const fresh = require("../bench/pari-class-group-port/row21_phase6_fresh_adapter.cjs");
const execution = require("../bench/pari-class-group-port/qualification_execution_core.cjs");

const projection = {
  schema: sage.PROJECTION_SCHEMA,
  scope: "exact-abstract-class-and-unit-structure",
  field: { id: sage.FIELD_ID,
    polynomialAscending: [...sage.POLYNOMIAL_ASCENDING] },
  classGroup: { classNumber: "1", invariantFactors: [], generatorCount: "0" },
  unitGroup: { rank: "3", torsionOrder: "2" },
  regulatorEvidence: "nonzero-only-not-equal-value",
  completionMode: "flag-zero-class-and-unit-result",
};

function owner(name, entries) {
  return { name, entries, logicalLength: String(entries.length),
    capacity: String(entries.length), encoding: "test", role: "test" };
}

function payload(units = ["2", "0", "0", "0", "0",
  "3", "0", "0", "0", "0", "5", "0", "0", "0", "0"]) {
  return {
    field: { id: sage.FIELD_ID, degree: "5",
      definingPolynomialAscending: [...sage.POLYNOMIAL_ASCENDING] },
    classGroup: { classNumber: "1", generatorCount: "0", invariantFactors: [],
      presentationOwner: "class-presentation" },
    unitGroup: { rank: "3", torsionOrder: "2" },
    storage: [
      owner("exact-unit-coordinates", units),
      owner("exact-unit-inverses", ["1", ...Array(14).fill("0")]),
      owner("exact-unit-norms", ["-1", "-1", "-1"]),
      owner("accepted-regulator", ["123", "192", "0"]),
    ],
  };
}

test("row 21 compares only the exact abstract group structure", () => {
  assert.deepEqual(pari.validateProjection(structuredClone(projection)), projection);
  assert.deepEqual(sage.semanticProjection(payload()), projection);
  assert.equal(projection.regulatorEvidence, "nonzero-only-not-equal-value");
  assert.throws(() => sage.semanticProjection(payload(Array(15).fill("0"))),
    /units are all zero/);
  const changed = structuredClone(projection);
  changed.unitGroup.rank = "2";
  assert.throws(() => pari.validateProjection(changed));
});

test("Sage replay projection requires detached capability replay identity", () => {
  const value = payload();
  const replay = {
    schema: require("../bench/pari-class-group-port/row21_phase6_final_result.cjs")
      .REPLAY_SCHEMA,
    fieldId: sage.FIELD_ID, correspondence_complete: true,
    public_complete: false, payloadSha256: neutral.sha256Canonical(value),
  };
  const projected = sage.replayProjection(value, replay);
  assert.equal(projected.schema, sage.REPLAY_SCHEMA);
  assert.notDeepEqual(projected, sage.semanticProjection(value));
  replay.payloadSha256 = "0".repeat(64);
  assert.throws(() => sage.replayProjection(value, replay));
});

test("the pristine helper isolates the prepared bnfinit0 clock", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "bench",
    "pari-class-group-port", "row21_phase6_pari_prepared_adapter.c"), "utf8");
  assert.match(source,
    /nf = nfinit0\([\s\S]*prepared_stack = avma;[\s\S]*READY/);
  assert.match(source,
    /setrand\(gp_read_str\(seed\)\);[\s\S]*clock_gettime\(CLOCK_MONOTONIC, &begin\);\s*\+\+bnfinit0_call_count;\s*bnf = bnfinit0\(nf, 0, NULL, nbits2prec\(192\)\);\s*clock_gettime\(CLOCK_MONOTONIC, &end\);/);
  assert.match(source,
    /\+\+bnfinit0_call_count;\s*bnf = bnfinit0/);
  assert.match(source,
    /Re-read and recompute replay facts independently[\s\S]*replay_class_number = mulii[\s\S]*replay_unit_log_columns = lg\(bnf_get_logfu\(bnf\)\) - 1/);
  assert.match(source,
    /avma = prepared_stack;\s*emit_run\(nf, seed\);\s*avma = prepared_stack;/);
});

test("work and resource counters are observed, not shared constants", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "bench",
    "pari-class-group-port", "row21_phase6_fresh_adapter.cjs"), "utf8");
  assert.doesNotMatch(source, /const COUNTERS/);
  assert.match(source, /raw\.observedCounters/);
  assert.match(source, /raw\.resourceCounters\.mathematicalCalls/);
  assert.match(source, /reason: "subprocess-not-observed"/);
  assert.match(source, /implementation === "sagejs"[\s\S]*: null/);
});

test("PARI projection and replay are separately validated", () => {
  const sample = {
    schema: "sagejs.pari-class-group/row21-pari-prepared-sample-v2",
    kernelNanoseconds: "1", processMaxRssKiB: "1",
    projection: structuredClone(projection),
    replay: { schema: sage.REPLAY_SCHEMA,
      scope: "exact-abstract-class-and-unit-structure", fieldId: sage.FIELD_ID,
      classNumber: "1", invariantFactors: [], generatorCount: "0",
      unitRank: "3", torsionOrder: "2", regulatorNonzero: true },
    observedCounters: { classGenerators: "0", classNumber: "1", degree: "5",
      exactFundamentalUnits: "3", unitRank: "3" },
    resourceCounters: { bnfinit0CallCount: "1", mathematicalCalls: "1" },
    rng: { algorithm: "pari-xorshift1024star-2.17.4", seed: "1",
      terminalState: Array(66).fill("0") },
  };
  assert.equal(pari.validateSample(sample), sample);
  const changedProjection = structuredClone(sample);
  changedProjection.projection.unitGroup.rank = "2";
  assert.throws(() => pari.validateSample(changedProjection));
  const changedReplay = structuredClone(sample);
  changedReplay.replay.unitRank = "2";
  assert.throws(() => pari.validateSample(changedReplay));
  const changedCalls = structuredClone(sample);
  changedCalls.resourceCounters.bnfinit0CallCount = "0";
  assert.throws(() => pari.validateSample(changedCalls));
});

test("execution core preserves unavailable subprocess thread CPU", async () => {
  const sample = () => ({ kernelNanoseconds: "1", threadCpuNanoseconds: null,
    peakRssKiB: "1", output: projection,
    replay: { schema: sage.REPLAY_SCHEMA }, rng: { seed: "1" },
    counters: { calls: "1" }, resourceCounters: { mathematicalCalls: "1" },
    stageTiming: { inclusiveNanoseconds: "1", leaves: {
      relationRetry: "0", sparseHnfSnfTransform: "0", unitRegulator: "0",
      honestyGeneratorsFinal: "0" }, unattributedNanoseconds: "1" } });
  const adapter = { implementation: "pari", async runFresh() {
    return sample();
  } };
  const request = { boundary: "prepared-kernel", fieldId: sage.FIELD_ID,
    repetitions: 2, seed: "1", tier: "diagnostic" };
  const batch = await execution.executeFreshBatch(adapter, request);
  assert.equal(batch.threadCpuNanoseconds, null);

  for (const tier of ["flag-zero", "compact-flag-one"])
    await assert.rejects(execution.executeFreshBatch(adapter,
      { ...request, repetitions: 1, tier }), /only for diagnostics/);

  let repetition = 0;
  const mixed = { implementation: "pari", async runFresh() {
    const value = sample();
    value.threadCpuNanoseconds = repetition++ === 0 ? null : "1";
    return value;
  } };
  await assert.rejects(execution.executeFreshBatch(mixed, request),
    /changed thread CPU availability/);
});

function authenticatedReport() {
  const authorities = checker.sourceAuthorities();
  assert.deepEqual(Object.keys(authorities).sort(), ["aggregateComposer",
    "checker", "exactFinalResult", "executionCore", "freshAdapter",
    "generatedAggregate", "pariAdapter", "pariHelper", "sageAdapter"]);
  for (const value of Object.values(authorities))
    assert.match(value.sha256, /^[0-9a-f]{64}$/);
  const report = {
    schema: "test", fieldId: sage.FIELD_ID,
    projectionSchema: sage.PROJECTION_SCHEMA, replaySchema: sage.REPLAY_SCHEMA,
    qualifiedTiming: false, campaignExecuted: false, executionEnabled: false,
    reserveOpeningEnabled: false, reservesOpened: false,
    exactSymmetricGroupStructureProjection: true,
    exactIndependentReplayParity: true, sourceAuthorities: authorities,
    note: "bound note",
    sagejs: { batch: { outputDigest: "a", replayDigest: "b",
      rngDigest: "c", workDigest: "d", resourceCounters: {
        mathematicalCalls: "2" } }, provenance: {}, observations: [
      { provenance: {}, exactSageEvidence: { exactUnitCoordinatesSha256: "u1" } },
      { provenance: {}, exactSageEvidence: { exactUnitCoordinatesSha256: "u2" } },
    ] },
    pari: { batch: { threadCpuNanoseconds: null, replayDigest: "b",
      resourceCounters: { bnfinit0CallCount: "2", mathematicalCalls: "2" } },
    provenance: {}, observations: [{ replay: { unitRank: "3" } }] },
  };
  report.receiptAuthoritySha256 = checker.receiptAuthority(report);
  return report;
}

test("receipt authority binds every reviewed implementation layer", () => {
  const report = authenticatedReport();
  assert.equal(checker.verifyReport(report), report);
  for (const mutate of [
    value => { value.pari.batch.resourceCounters.bnfinit0CallCount = "3"; },
    value => { value.pari.batch.threadCpuNanoseconds = "1"; },
    value => { value.pari.batch.replayDigest = "changed"; },
    value => { value.sagejs.observations[1].exactSageEvidence
      .exactUnitCoordinatesSha256 = "changed"; },
    value => { value.note = "changed"; },
  ]) {
    const changed = structuredClone(authenticatedReport());
    mutate(changed);
    assert.throws(() => checker.verifyReport(changed), /authority changed/);
  }
  const changedSource = structuredClone(authenticatedReport());
  changedSource.sourceAuthorities.checker.sha256 = "0".repeat(64);
  assert.throws(() => checker.verifyReport(changedSource), /source authority/);
});

test("configuration and smoke gates remain closed", async () => {
  await assert.rejects(() => fresh.createRow21FreshPreparedAdapter(
    { panelIndex: 20, implementation: "sagejs" }));
  const source = fs.readFileSync(path.join(__dirname, "..", "bench",
    "pari-class-group-port", "check_row21_phase6_qualification_pair.cjs"),
  "utf8");
  assert.match(source, /qualifiedTiming: false/);
  assert.match(source, /executionEnabled: false/);
  assert.match(source, /reserveOpeningEnabled: false/);
  assert.match(source, /repetitions: 2/);
});

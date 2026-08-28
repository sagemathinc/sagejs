// sagejs-test-tier: specialized
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  PRIMARY_PRIMES,
  SOURCE_VALUES,
  buildPairedComparison,
  checkedV8NormalizationFactor,
  compileWasmTarget,
  exactNumberProductGuard,
  expectedOrder,
  fastIntegerPerformanceGuard,
  independentCpythonOracle,
  runFeasibility,
  validateDenseCubicInput,
  validateReport,
} = require(
  "../bench/optimizer-workloads/modular-scan-target-feasibility.cjs"
);

const root = path.resolve(__dirname, "..");
const cSource = path.join(
  root,
  "bench/optimizer-workloads/modular-scan-target.c",
);
const publicOutputDigest =
  "ea10a46b48f72354b5d6ffe19eb0eb900547167f3d8ecea1efe8152fc42176ad";

test("the reviewed phase uses deterministic 11-pair ABBA evidence", () => {
  assert.deepEqual(
    Array.from({ length: 11 }, (_value, index) => expectedOrder(index)),
    ["AB", "BA", "BA", "AB", "AB", "BA", "BA", "AB", "AB", "BA", "BA"],
  );
  const expected = [[1, 7, 11]];
  let genericClock = 1_000;
  let feasibleClock = 100;
  const comparison = buildPairedComparison({
    target: "fixture-v8",
    samples: 11,
    generic() {
      return { nanoseconds: genericClock++, output: expected };
    },
    feasible() {
      return { nanoseconds: feasibleClock++, output: expected };
    },
    expected,
    publicOutputDigest,
    phaseOutputDigest: "a".repeat(64),
  });
  assert.equal(comparison.rawPairs.length, 11);
  assert.equal(comparison.opportunityEvidencePairs.length, 11);
  assert.ok(comparison.rawPairs.every(
    (pair) => pair.baselinePublicOutputDigest === publicOutputDigest &&
      pair.feasiblePublicOutputDigest === publicOutputDigest,
  ));
});

test("checked V8 guards fail before publication and preserve one fallback", () => {
  assert.deepEqual(validateDenseCubicInput(SOURCE_VALUES, 5_003, {
    primeAuthenticated: true,
  }), { ok: true, canonical: SOURCE_VALUES });
  assert.equal(exactNumberProductGuard(94_906_266), true);
  assert.equal(exactNumberProductGuard(94_906_267), false);
  assert.equal(fastIntegerPerformanceGuard(46_301), true);
  assert.equal(fastIntegerPerformanceGuard(46_349), false);

  let fallbackCalls = 0;
  const sentinel = Object.freeze({ untouched: true });
  const answer = checkedV8NormalizationFactor([1, 0, 0, 1n], 5_003, {
    primeAuthenticated: true,
    fallback(_values, _prime, reason) {
      fallbackCalls += 1;
      assert.equal(reason, "coefficient-not-exact-safe-integer");
      return sentinel;
    },
  });
  assert.equal(answer, sentinel);
  assert.equal(fallbackCalls, 1);

  let interruptCalls = 0;
  assert.throws(() => checkedV8NormalizationFactor(SOURCE_VALUES, 5_003, {
    primeAuthenticated: true,
    checkInterrupt() {
      interruptCalls += 1;
      throw new Error("interrupt before publication");
    },
  }), /interrupt before publication/);
  assert.equal(interruptCalls, 1);
});

test("independent CPython point counts pin both phase and public outputs", () => {
  const oracle = independentCpythonOracle(PRIMARY_PRIMES);
  assert.deepEqual(oracle.normalization, [
    [1, 0, 5_003],
    [1, -182, 10_009],
    [1, 112, 20_011],
  ]);
  assert.deepEqual(oracle.public_factors, [
    [1, -1, 5_003, -5_003],
    [1, -183, 10_191, -10_009],
    [1, 111, 19_899, -20_011],
  ]);
});

test("an absent C-to-Wasm producer is an explicit unavailable target", () => {
  const result = compileWasmTarget({
    sourcePath: cSource,
    sourceRepositoryPath:
      "bench/optimizer-workloads/modular-scan-target.c",
    clang: `definitely-absent-clang-${process.pid}`,
    producerSamples: 1,
    compileSamples: 1,
    instantiateSamples: 1,
  });
  assert.equal(result.availability, "unavailable");
  assert.equal(result.reason, "clang-not-found");
  assert.equal(result.provenance.productionRouteClaim, "none-feasibility-only");
  assert.deepEqual(result.provenance.producerNanoseconds.length, 1);
});

test("the real smoke harness compares current generic, V8, and honest Wasm", async () => {
  const report = await runFeasibility({
    root,
    samples: 1,
    warmups: 1,
    crossoverSamples: 1,
    producerSamples: 1,
    compileSamples: 1,
    instantiateSamples: 1,
  });
  validateReport(report);
  assert.equal(report.protocol.standardEvidence, false);
  assert.equal(report.measurementScope.phaseId, "normalization-factor");
  assert.equal(report.productionCompilerRouteClaim, "none");
  assert.equal(
    report.opportunityEvidenceAdapter.compilerDecision.id,
    "sha256:d8f23a140bed2fbe8b8d99280e21ab374d0fea8f66dff2c624188a1efbec386d",
  );
  assert.equal(report.comparisons.v8.rawPairs.length, 1);
  assert.deepEqual(report.exactDifferential.currentGeneric, report.oracle.normalizationFactors);
  assert.deepEqual(report.exactDifferential.checkedV8, report.oracle.normalizationFactors);
  assert.equal(report.guardFallbackAndPublicationAudit.v8Interrupt.publications, 0);
  assert.equal(report.guardFallbackAndPublicationAudit.invalidWasmCases.length, 7);
  if (report.targets.wasm.availability === "available") {
    assert.deepEqual(report.exactDifferential.checkedWasm, report.oracle.normalizationFactors);
    assert.equal(report.comparisons.wasm.rawPairs.length, 1);
    assert.equal(report.targets.wasm.execution.inputCopiedBytesPerPhase, 48);
    assert.ok(report.targets.wasm.accounting.sourceToWasm.samples[0] > 0);
    assert.equal(
      report.guardFallbackAndPublicationAudit.wasmInterrupt.publications,
      0,
    );
  } else {
    assert.equal(report.comparisons.wasm.status, "unavailable");
    assert.equal(report.comparisons.wasm.rawPairs.length, 0);
    assert.ok(report.targets.wasm.reason);
  }
  const inconclusive =
    report.opportunityEvidenceAdapter.phaseReceiptData.negativeTargets[0];
  assert.equal(inconclusive.target, "wasm");
  assert.match(inconclusive.disposition, /production-inconclusive/);
  assert.equal(inconclusive.productionRouteClaim, "none");
  assert.equal(inconclusive.outputDigest, publicOutputDigest);
});

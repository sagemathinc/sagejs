// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  MODULUS,
  SOURCE_COEFFICIENTS,
  SOURCE_LENGTH,
  ZERO_SOURCE_INDEX,
  buildPairedComparison,
  checkedV8IndexedDivision,
  checkedWasmIndexedDivision,
  compileWasmTarget,
  derivativeReplay,
  expectedOrder,
  independentBigIntOracle,
  runFeasibility,
  validateIndexedDivisionInput,
  validateReport,
} = require(
  "../bench/optimizer-workloads/indexed-division-target-feasibility.cjs"
);

const root = path.resolve(__dirname, "..");
const cSource = path.join(
  root,
  "bench/optimizer-workloads/indexed-division-target.c",
);
const publicOutputDigest =
  "5d86bc746f1335185e62afc58af05509f2b9475a030744f16035e1f05e729de8";

test("the reviewed phase uses deterministic 11-pair ABBA evidence", () => {
  assert.deepEqual(
    Array.from({ length: 11 }, (_value, index) => expectedOrder(index)),
    ["AB", "BA", "BA", "AB", "AB", "BA", "BA", "AB", "AB", "BA", "BA"],
  );
  const expected = [0, 7, 11];
  let baseline = 1_000;
  let feasible = 100;
  const comparison = buildPairedComparison({
    target: "fixture",
    samples: 11,
    generic: () => ({ nanoseconds: baseline++, output: expected }),
    feasible: () => ({ nanoseconds: feasible++, output: expected }),
    expected,
    publicOutputDigest,
    phaseOutputDigest: "a".repeat(64),
  });
  assert.equal(comparison.rawPairs.length, 11);
  assert.equal(comparison.opportunityEvidencePairs.length, 11);
});

test("the exact public coefficients and independent BigInt oracle replay", () => {
  assert.equal(SOURCE_COEFFICIENTS.length, SOURCE_LENGTH);
  assert.equal(SOURCE_COEFFICIENTS[ZERO_SOURCE_INDEX], 0);
  assert.equal(SOURCE_COEFFICIENTS.at(-1), 65_112);
  const oracle = independentBigIntOracle();
  assert.equal(oracle.length, SOURCE_LENGTH + 1);
  assert.equal(derivativeReplay(oracle, SOURCE_COEFFICIENTS), true);
  assert.deepEqual(
    [0, 1, 2, 65_536, 65_537, 65_538, 70_000].map(
      (index) => oracle[index],
    ),
    [0, 65_530, 32_767, 9, 0, 65_530, 52_453],
  );
});

test("checked V8 includes validation, normalization, exceptions, and publication", () => {
  assert.deepEqual(
    validateIndexedDivisionInput([1, 2, 0, 0], MODULUS, {
      primeAuthenticated: true,
    }),
    { ok: true, canonical: [1, 2] },
  );
  let fallbackCalls = 0;
  const sentinel = Object.freeze({ fallback: true });
  assert.equal(checkedV8IndexedDivision([1, 2n], MODULUS, {
    primeAuthenticated: true,
    fallback(_input, _prime, reason) {
      fallbackCalls += 1;
      assert.equal(reason, "coefficient-not-exact-safe-integer");
      return sentinel;
    },
  }), sentinel);
  assert.equal(fallbackCalls, 1);

  const divisionByZero = [...SOURCE_COEFFICIENTS];
  divisionByZero[ZERO_SOURCE_INDEX] = 1;
  assert.throws(
    () => checkedV8IndexedDivision(divisionByZero, MODULUS, {
      primeAuthenticated: true,
    }),
    (error) => error.name === "ZeroDivisionError",
  );
  let interrupts = 0;
  assert.throws(() => checkedV8IndexedDivision(
    SOURCE_COEFFICIENTS,
    MODULUS,
    {
      primeAuthenticated: true,
      checkInterrupt() {
        interrupts += 1;
        throw new Error("test interrupt");
      },
    },
  ), /test interrupt/);
  assert.equal(interrupts, 1);
});

test("an absent C-to-Wasm producer remains explicit unavailable evidence", () => {
  const target = compileWasmTarget({
    sourcePath: cSource,
    sourceRepositoryPath:
      "bench/optimizer-workloads/indexed-division-target.c",
    clang: `definitely-absent-clang-${process.pid}`,
    producerSamples: 1,
    compileSamples: 1,
    instantiateSamples: 1,
  });
  assert.equal(target.availability, "unavailable");
  assert.equal(target.reason, "clang-not-found");
  assert.equal(target.provenance.productionRouteClaim, "none-feasibility-only");
});

test("the isolated C-to-Wasm target is copy-complete and exact", () => {
  const target = compileWasmTarget({
    sourcePath: cSource,
    sourceRepositoryPath:
      "bench/optimizer-workloads/indexed-division-target.c",
    producerSamples: 1,
    compileSamples: 1,
    instantiateSamples: 1,
  });
  if (target.availability === "unavailable") {
    assert.ok(target.reason);
    return;
  }
  const accounting = {
    inputCopiedBytes: 0,
    outputCopiedBytes: 0,
    memoryGrowthPages: 0,
  };
  const output = checkedWasmIndexedDivision(
    target,
    SOURCE_COEFFICIENTS,
    MODULUS,
    { primeAuthenticated: true, accounting },
  );
  assert.deepEqual(output, independentBigIntOracle());
  assert.equal(derivativeReplay(output, SOURCE_COEFFICIENTS), true);
  assert.equal(
    accounting.inputCopiedBytes,
    SOURCE_LENGTH * Uint32Array.BYTES_PER_ELEMENT,
  );
  assert.equal(
    accounting.outputCopiedBytes,
    (SOURCE_LENGTH + 1) * Uint32Array.BYTES_PER_ELEMENT,
  );
  assert.equal(target.provenance.productionRouteClaim, "none-feasibility-only");
});

test("standard evidence refuses an unauthenticated build", async () => {
  await assert.rejects(
    runFeasibility({ allowUnverifiedBuild: true }),
    /standard target-feasibility evidence cannot use an unverified build/,
  );
});

test("the real smoke compares generic, V8, Wasm, and retained alternatives", async () => {
  const report = await runFeasibility({
    root,
    samples: 1,
    warmups: 1,
    producerSamples: 1,
    compileSamples: 1,
    instantiateSamples: 1,
    allowUnverifiedBuild: true,
  });
  validateReport(report);
  assert.equal(report.status, "development-smoke-non-promotable");
  assert.equal(report.protocol.standardEvidence, false);
  assert.equal(report.measurementScope.phaseId, "dense-integral");
  assert.equal(report.productionCompilerRouteClaim, "none");
  assert.equal(report.opportunityEvidenceAdapter.consumable, false);
  assert.equal(report.comparisons.v8.rawPairs.length, 1);
  assert.equal(report.targets.matureLibrary.availability, "available");
  assert.equal(
    report.targets.matureLibrary.disposition,
    "mature-algorithm-available-compiler-candidate-duplicate",
  );
  assert.equal(
    report.targets.sourceTransparentNative.availability,
    "unavailable",
  );
  assert.equal(
    report.guardFallbackExceptionInterruptPublicationAudit.v8Interrupt
      .publications,
    0,
  );
  if (report.targets.wasm.availability === "available") {
    assert.equal(report.comparisons.wasm.rawPairs.length, 1);
    assert.equal(
      report.targets.wasm.execution.inputCopiedBytesPerPhase,
      SOURCE_LENGTH * Uint32Array.BYTES_PER_ELEMENT,
    );
    assert.equal(
      report.targets.wasm.execution.outputCopiedBytesPerPhase,
      (SOURCE_LENGTH + 1) * Uint32Array.BYTES_PER_ELEMENT,
    );
    assert.equal(
      report.targets.wasm.execution.directionalBoundaryCrossingsPerPhase,
      548,
    );
    assert.ok(report.targets.wasm.accounting.sourceToWasm.samples[0] > 0);
  } else {
    assert.equal(report.comparisons.wasm.status, "unavailable");
  }
  assert.equal(
    report.opportunityEvidenceAdapter.phaseReceiptData.negativeTargets.length,
    2,
  );
  assert.equal(
    report.opportunityEvidenceAdapter.phaseReceiptData.matureAlgorithm
      .availability,
    "available",
  );
});

// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { diagnoseEvaluationBoundary, diagnosePhases, diagnoseRepeatedCellPhases,
  parseArguments, timedBoundary } = require(
  "../bench/pari-class-group-rust/qualification/public-quadratic-boundary/benchmark/run-public-sagejs.cjs"
);

test("public quadratic diagnostic enables phases only on explicit request", () => {
  const ordinary = parseArguments(["1", "larger-composite-d15000000315"]);
  assert.equal(ordinary.samples, 1);
  assert.equal(ordinary.fields.length, 1);
  assert.equal(ordinary.phases, false);
  assert.equal(ordinary.repeatedPhases, false);

  const profiled = parseArguments(["1", "larger-composite-d15000000315", "--phases",
    "--repeated-phases", "--receipt", "repeated-cell-diagnostic.json"]);
  assert.equal(profiled.samples, 1);
  assert.equal(profiled.fields.length, 1);
  assert.equal(profiled.phases, true);
  assert.equal(profiled.repeatedPhases, true);
  assert.equal(profiled.receipt, "repeated-cell-diagnostic.json");
  assert.throws(() => parseArguments(["1", "--phases", "--phases"]), /usage/);
  assert.throws(() => parseArguments(["1", "--repeated-phases", "--repeated-phases"]), /usage/);
  assert.throws(() => parseArguments(["--receipt", "../escape.json"]), /usage/);
  assert.throws(() => parseArguments(["1", "unknown", "--phases"]), /unknown frozen field/);
});

test("repeated-cell probe keeps the exact source consecutive and checks the field", async () => {
  const calls = [];
  const expected = "[5, (5,), 'exact-unconditional', 'rust']";
  const sage = {
    async evaluate(source) {
      calls.push(source);
      return {
        repr: source === "0" ? "0" : source === "L.discriminant()" ? "-47" :
          source.includes("G.order()") ? expected : "",
        durationMs: 0.25,
      };
    },
  };
  const field = {
    pariPolynomial: "x^2-x+12",
    expected: { discriminant: -47, classNumber: 5, invariantFactors: [5] },
  };
  const phases = await diagnoseRepeatedCellPhases(sage, field, 2);
  assert.deepEqual(Object.keys(phases), ["empty", "polynomial", "fieldFromPolynomial",
    "preparedGroup", "freshPolynomialGroup"]);
  for (const phase of Object.values(phases)) {
    assert.ok(phase.wallMedianNanoseconds > 0);
    assert.equal(phase.executionMedianNanoseconds, 250000);
  }
  assert.equal(calls.length, 16);
  for (let offset = 0; offset < 15; offset += 3) {
    assert.equal(calls[offset], calls[offset + 1]);
    assert.equal(calls[offset], calls[offset + 2]);
  }
  assert.equal(calls.at(-1), "L.discriminant()");
  sage.evaluate = async (source) => ({
    repr: source === "L.discriminant()" ? "-3" : source === "0" ? "0" :
      source.includes("G.order()") ? expected : "",
    durationMs: 0.25,
  });
  await assert.rejects(diagnoseRepeatedCellPhases(sage, field, 1), /wrong discriminant/);
});

test("evaluation-boundary probe keeps public wall and execution clocks distinct", async () => {
  const calls = [];
  const sage = {
    async evaluate(source) {
      calls.push(source);
      return { repr: source, durationMs: 0.25 };
    },
  };
  const one = await timedBoundary(sage, "answer", "answer");
  assert.ok(one.wallNanoseconds > 0);
  assert.equal(one.executionNanoseconds, 250000);
  const rows = await diagnoseEvaluationBoundary(sage, "group", "group", "scalar", "scalar", 2);
  assert.deepEqual(calls, ["answer", "0", "group", "scalar", "0", "group", "scalar"]);
  assert.deepEqual(Object.keys(rows), ["empty", "freshGroup", "scalar"]);
  for (const row of Object.values(rows)) {
    assert.ok(row.wallMedianNanoseconds > 0);
    assert.equal(row.executionMedianNanoseconds, 250000);
  }
  await assert.rejects(
    timedBoundary({ evaluate: async () => ({ repr: "answer" }) }, "answer", "answer"),
    /omitted its execution-only duration/,
  );
});

test("phase diagnostic rejects an incomplete map", async () => {
  const sage = {
    async evaluate(source) {
      if (source.includes("phase_result")) {
        assert.match(source, /imaginary-class-group-summary/);
        assert.match(source, /_verify_imaginary_presentation/);
        return { repr: "[0, 3]" };
      }
      assert.match(source, /validate_imaginary_group_result/);
      assert.match(source, /get\('reducedFormsPacked', \[\]\)/);
      assert.match(source, /\['classGroupCompact', \['imaginary-class-group', encoded_request\]\]/);
      return { repr: "[12.5, 8.25, 1.5, 3, 2, 0.5, 0.75, 1, 9.5, 3]" };
    },
  };
  await assert.rejects(diagnosePhases(sage, 3), /complete class map/);
  sage.evaluate = async (source) => ({ repr: source.includes("phase_result")
    ? "[0, 3]"
    : "[12.5, 8.25, 1.5, 3, 3, 0.5, 0.75, 1, 9.5, 3]" });
  assert.deepEqual(await diagnosePhases(sage, 3), {
    serviceAndConversionMs: 12.5,
    hostServiceMs: 9.5,
    pythonConversionMs: 3,
    independentValidationMs: 8.25,
    compactValidationMs: 1.5,
    exactMapRecheck: {
      validatedPackingMs: 0.5,
      kernelMs: 0.75,
      materializeMs: 1,
    },
  });
});

test("phase diagnostic reports the compact presentation without requiring an eager map", async () => {
  const sage = {
    async evaluate(source) {
      assert.match(source, /_verify_imaginary_presentation/);
      assert.doesNotMatch(source, /validate_imaginary_group_result/);
      return { repr: "[1, 9.5, 4.6, 1.1, 2.2, 33768]" };
    },
  };
  assert.deepEqual(await diagnosePhases(sage, 33768), {
    publicReceiptMs: 9.5,
    summaryServiceMs: 4.6,
    validationMs: 1.1,
    detachedVerificationMs: 2.2,
    note: "Summary and detached verification timings come from a separate replay after the public receipt; they are not additive components of publicReceiptMs.",
  });
  await assert.rejects(diagnosePhases(sage, 4), /wrong class number/);
});

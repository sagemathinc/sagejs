// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { diagnoseEvaluationBoundary, diagnosePhases, parseArguments, timedBoundary } = require(
  "../bench/pari-class-group-rust/qualification/public-quadratic-boundary/benchmark/run-public-sagejs.cjs"
);

test("public quadratic diagnostic enables phases only on explicit request", () => {
  const ordinary = parseArguments(["1", "larger-composite-d15000000315"]);
  assert.equal(ordinary.samples, 1);
  assert.equal(ordinary.fields.length, 1);
  assert.equal(ordinary.phases, false);

  const profiled = parseArguments(["1", "larger-composite-d15000000315", "--phases"]);
  assert.equal(profiled.samples, 1);
  assert.equal(profiled.fields.length, 1);
  assert.equal(profiled.phases, true);
  assert.throws(() => parseArguments(["1", "--phases", "--phases"]), /usage/);
  assert.throws(() => parseArguments(["1", "unknown", "--phases"]), /unknown frozen field/);
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
      assert.match(source, /validate_imaginary_group_result/);
      return { repr: "[12.5, 8.25, 1.5, 3, 2, 0.5, 0.75, 1]" };
    },
  };
  await assert.rejects(diagnosePhases(sage, 3), /complete class map/);
  sage.evaluate = async () => ({ repr: "[12.5, 8.25, 1.5, 3, 3, 0.5, 0.75, 1]" });
  assert.deepEqual(await diagnosePhases(sage, 3), {
    serviceAndConversionMs: 12.5,
    independentValidationMs: 8.25,
    compactValidationMs: 1.5,
    exactMapRecheck: {
      validatedPackingMs: 0.5,
      kernelMs: 0.75,
      materializeMs: 1,
    },
  });
});

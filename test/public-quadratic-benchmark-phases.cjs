// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { diagnosePhases, parseArguments } = require(
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

test("phase diagnostic rejects an incomplete map", async () => {
  const sage = {
    async evaluate(source) {
      assert.match(source, /validate_imaginary_group_result/);
      return { repr: "[12.5, 8.25, 3, 2]" };
    },
  };
  await assert.rejects(diagnosePhases(sage, 3), /complete class map/);
  sage.evaluate = async () => ({ repr: "[12.5, 8.25, 3, 3]" });
  assert.deepEqual(await diagnosePhases(sage, 3), {
    serviceAndConversionMs: 12.5,
    independentValidationMs: 8.25,
  });
});

// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { cubicEquationIndex, cubicIndexDiagnostics } = require(
  "../bench/class-unit-groups/cubic-equation-index.cjs",
);
const { selectFrontierCandidate } = require(
  "../bench/class-unit-groups/run-complex-cubic-frontier.cjs",
);

const field = Object.freeze({
  label: "3.1.12716.2",
  coefficients: Object.freeze(["-63", "-11", "-1", "1"]),
  discriminant: "-12716",
  discriminant_absolute: "12716",
  equation_order_index: "1",
  class_number: "3",
});

test("equation-order index is derived without changing the frozen field index", () => {
  const before = JSON.stringify(field);
  assert.equal(cubicEquationIndex(field), "3");
  assert.deepEqual(cubicIndexDiagnostics(field), {
    equation_order_index: "3", lmfdb_field_index: "1",
  });
  assert.equal(JSON.stringify(field), before);
  assert.equal(cubicEquationIndex({ ...field,
    coefficients: ["1", "0", "-1", "1"], discriminant: "-23" }), "1");
  // Replacing alpha by 2 alpha multiplies the cubic power-basis determinant
  // by 2^(0+1+2), so this defining equation has index 8 * 3.
  assert.equal(cubicEquationIndex({ ...field,
    coefficients: ["-504", "-44", "-2", "1"] }), "24");
});

test("equation-index derivation rejects invalid signs, ratios and inputs", () => {
  for (const discriminant of ["0", "12716", "-12717"]) {
    assert.throws(() => cubicEquationIndex({ ...field, discriminant }), /discriminant ratio/);
  }
  assert.throws(() => cubicEquationIndex({ ...field, discriminant: "-57222" }), /not a square/);
  assert.throws(() => cubicEquationIndex({ ...field,
    coefficients: ["-1", "-1", "0", "2"] }), /monic cubic/);
  assert.throws(() => cubicEquationIndex({ ...field,
    coefficients: ["-63", "-11.0", "-1", "1"] }), /exact decimal integer/);
});

test("frontier tie-breaking uses actual equation indices and reports raw field index", () => {
  const wider = { ...field, label: "larger-index",
    coefficients: ["-504", "-44", "-2", "1"] };
  const narrower = { ...field, label: "smaller-index", equation_order_index: "2" };
  const corpus = { records: [wider, narrower] };
  const before = JSON.stringify(corpus);
  const census = { records: corpus.records.map((record) => ({
    label: record.label, status: "native-decline-fallback-pass",
  })) };
  const selected = selectFrontierCandidate(corpus, census, []);
  assert.equal(selected.label, narrower.label);
  assert.equal(selected.equation_order_index, "3");
  assert.equal(selected.lmfdb_field_index, "2");
  assert.equal(JSON.stringify(corpus), before);
});

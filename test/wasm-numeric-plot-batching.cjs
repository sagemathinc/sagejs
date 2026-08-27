// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const flint = require("../packages/flint");

test("elliptic plot batches use the shared domain-sensitive work precision", () => {
  const low = flint.ecLseriesValues(
    37n,
    -1,
    [0, 1],
    [["1", "0"]],
    16,
    8,
    1,
  );
  const plot = flint.ecLseriesValues(
    37n,
    -1,
    [0, 1],
    [["0", "4"], ["1", "4"], ["2", "4"]],
    16,
    8,
    1,
  );
  const tall = flint.ecLseriesValues(
    37n,
    -1,
    [0, 1],
    [["1", "50"]],
    16,
    8,
    1,
  );

  assert.ok(low.workPrecisionBits >= low.finePrecisionBits);
  assert.ok(plot.workPrecisionBits >= plot.finePrecisionBits);
  assert.ok(tall.workPrecisionBits > plot.workPrecisionBits);
  assert.ok(
    plot.workPrecisionBits < plot.finePrecisionBits + 160,
    `ordinary plot domain unexpectedly selected ${plot.workPrecisionBits} work bits`,
  );
  assert.ok(
    plot.workPrecisionBits < plot.finePrecisionBits + 512,
    "the browser's former fixed 512-bit guard must not become policy again",
  );
});

test("packed plot output retains nested coarse/fine numerical semantics", () => {
  const coefficients = flint.ecAnlistIntegral(
    0n,
    0n,
    1n,
    -1n,
    0n,
    37n,
    128n,
  );
  const points = [];
  for (const real of ["0", "1", "2"])
    for (const imaginary of ["0", "1", "4"])
      points.push([real, imaginary]);
  const result = flint.ecLseriesValues(
    37n,
    -1,
    coefficients,
    points,
    16,
    8,
    2,
  );

  assert.equal(result.status, "ok");
  assert.equal(result.knownErrorTargetMet, true);
  assert.equal(result.packedStride, 5);
  assert.equal(result.packedValues.length, 5 * points.length);
  for (const value of result.packedValues)
    assert.ok(Number.isFinite(value));
});

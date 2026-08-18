"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const flint = require("../packages/flint");

function close(actualText, expected, tolerance) {
  const actual = Number(actualText);
  assert.ok(Number.isFinite(actual), `expected finite decimal, got ${actualText}`);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`,
  );
}

function evaluateIntegralCurve(curve, conductor, rootNumber, points, precision) {
  const planned = flint.ecLseriesValues(
    conductor,
    rootNumber,
    [0, 1],
    points,
    precision,
  );
  assert.equal(planned.status, "insufficient_coefficients");
  const coefficients = flint.ecAnlistIntegral(
    ...curve,
    conductor,
    BigInt(planned.requiredCutoff),
  );
  return {
    coefficients,
    result: flint.ecLseriesValues(
      conductor,
      rootNumber,
      coefficients,
      points,
      precision,
    ),
  };
}

test("coefficient batching crosses a bad-reduction prime", () => {
  const coefficients = flint.ecAnlistIntegral(
    1n,
    2n,
    3n,
    4n,
    999n,
    430250329n,
    9371n,
  );
  assert.equal(coefficients[9349], 1);
  assert.equal(coefficients[9371], -36);
});

test("native complex L-value matches the pinned Sage/PARI oracle", () => {
  const { result } = evaluateIntegralCurve(
    [1n, 2n, 3n, 4n, 999n],
    430250329n,
    1,
    [["1", "1"]],
    53,
  );
  assert.equal(result.status, "ok");
  assert.equal(result.rigorous, false);
  assert.equal(result.knownErrorTargetMet, true);
  assert.equal(
    result.analyticErrorStatus,
    "coefficient_local_grid_and_outer_tail_only",
  );
  assert.equal(result.trapezoidDiscretizationStatus, "unbounded_nonrigorous");
  assert.ok(result.requiredCutoff > 133000);
  assert.ok(Number(result.values[0].analyticErrorBound) < 2 ** -53);
  close(
    result.values[0].raw.realMidpoint,
    -0.0053103195260299207325292689379,
    2e-16,
  );
  close(
    result.values[0].raw.imagMidpoint,
    0.0990520277396781685443611089003,
    2e-16,
  );
  close(
    result.values[0].completed.realMidpoint,
    -170.7949321559553497852550776713,
    2e-13,
  );
  assert.ok(Number(result.values[0].coefficientTailBound) > 0);
  assert.ok(Number(result.values[0].gridOmissionBound) > 0);
  assert.ok(Number(result.values[0].outerTailBound) > 0);
  assert.equal(result.outerTailBound, result.values[0].outerTailBound);
  assert.equal(result.analyticErrorBound, result.values[0].analyticErrorBound);
  assert.ok(Number(result.rawConversionMagnitude) > 0);
});

test("general order zero shares the central-jet normalization", () => {
  const { coefficients, result } = evaluateIntegralCurve(
    [0n, -1n, 1n, -10n, -20n],
    11n,
    1,
    [["1", "0"]],
    80,
  );
  const jet = flint.ecCompletedCentralDerivatives(
    11n,
    1,
    coefficients,
    0,
    1,
    80,
  );
  close(
    result.values[0].completed.realMidpoint,
    Number(jet.derivatives[0].midpoint),
    1e-24,
  );
  close(result.values[0].raw.realMidpoint, 0.2538418608559107, 2e-15);
});

test("batch evaluation preserves root sign, conjugation, and trivial zeros", () => {
  const { result } = evaluateIntegralCurve(
    [0n, 0n, 1n, -1n, 0n],
    37n,
    -1,
    [
      ["1", "0"],
      ["1", "1"],
      ["1", "-1"],
      ["0", "0"],
      ["-1", "0"],
      ["-0.99999904632568359375", "0"],
      ["3", "0"],
    ],
    80,
  );
  assert.equal(result.values.length, 7);
  assert.equal(result.values[0].completed.realMidpoint, "0");
  assert.equal(result.values[0].completed.imagMidpoint, "0");
  close(
    result.values[1].raw.realMidpoint,
    -0.158925263301377199110663432111,
    2e-15,
  );
  close(
    result.values[1].raw.imagMidpoint,
    0.457911066765115448151935389313,
    2e-15,
  );
  close(
    result.values[2].raw.realMidpoint,
    Number(result.values[1].raw.realMidpoint),
    1e-24,
  );
  close(
    result.values[2].raw.imagMidpoint,
    -Number(result.values[1].raw.imagMidpoint),
    1e-24,
  );
  assert.equal(result.values[3].raw.realMidpoint, "0");
  assert.equal(result.values[3].raw.imagMidpoint, "0");
  assert.equal(result.values[4].raw.realMidpoint, "0");
  assert.equal(result.values[4].raw.imagMidpoint, "0");
  assert.notEqual(result.values[5].raw.realMidpoint, "0");
  assert.ok(Math.abs(Number(result.values[5].raw.realMidpoint)) > 1e-8);
  close(
    result.values[4].completed.realMidpoint,
    -Number(result.values[6].completed.realMidpoint),
    1e-24,
  );
  assert.equal(result.knownErrorTargetMet, true);
});

test("200- and 512-bit Acb values preserve the pinned decimal prefix", () => {
  const points = [["1", "1"]];
  const plan = flint.ecLseriesValues(37n, -1, [0, 1], points, 512);
  const coefficients = flint.ecAnlistIntegral(
    0n,
    0n,
    1n,
    -1n,
    0n,
    37n,
    BigInt(plan.requiredCutoff),
  );
  const value200 = flint.ecLseriesValues(
    37n,
    -1,
    coefficients,
    points,
    200,
  );
  const value512 = flint.ecLseriesValues(
    37n,
    -1,
    coefficients,
    points,
    512,
  );
  const realPrefix = "-0.15892526330137719911066343211103092304460066413791";
  const imaginaryPrefix = "0.45791106676511544815193538931312204288528435247845";
  for (const result of [value200, value512]) {
    assert.equal(result.knownErrorTargetMet, true);
    assert.ok(result.values[0].raw.realMidpoint.startsWith(realPrefix));
    assert.ok(result.values[0].raw.imagMidpoint.startsWith(imaginaryPrefix));
  }
  assert.ok(value512.values[0].raw.accuracyBits >= 512);
  assert.ok(value512.values[0].raw.realRadius.includes("e-"));
  assert.ok(value512.values[0].raw.imagRadius.includes("e-"));
});

test("native L-value planner rejects unsupported domains before coefficient work", () => {
  assert.throws(
    () => flint.ecLseriesValues(37n, -1, [0, 1], [["1", "101"]], 53),
    /moderate-domain limits|resource limits/,
  );
  assert.throws(
    () => flint.ecLseriesValues(37n, -1, [0, 1], [["10", "0"]], 53),
    /moderate-domain limits|resource limits/,
  );
});

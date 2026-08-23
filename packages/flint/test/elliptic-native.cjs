"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const flint = require("..");

function rootNumber(coefficients) {
  return flint.ecRootNumber(...coefficients.flatMap((value) => [value, 1n]));
}

function relativeClose(actualText, expected, tolerance) {
  const actual = Number(actualText);
  assert.ok(Number.isFinite(actual), `expected a finite decimal, got ${actualText}`);
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} is not within relative tolerance ${tolerance} of ${expected}`,
  );
}

function geometricCoefficientTailBound(q, cutoff) {
  return (
    q ** (cutoff + 1) * ((cutoff + 1) - cutoff * q) / (1 - q) ** 2
  );
}

test("geometric coefficient-tail formula is positive and dominant", () => {
  for (const [q, cutoff] of [
    [0.2, 3],
    [0.75, 12],
    [0.98, 150],
  ]) {
    const bound = geometricCoefficientTailBound(q, cutoff);
    let partialTail = 0;
    for (let n = cutoff + 1; n < cutoff + 10000; n++) {
      partialTail += n * q ** n;
    }
    assert.ok(bound > 0, `tail bound at q=${q} must be positive`);
    assert.ok(
      bound >= partialTail * (1 - 1e-12),
      `tail bound at q=${q} must dominate its partial sum`,
    );
  }
});

test("eclib global root numbers include rational Q-isomorphic models", () => {
  assert.equal(rootNumber([0n, -1n, 1n, -10n, -20n]), 1);
  assert.equal(rootNumber([0n, 0n, 1n, -1n, 0n]), -1);
  assert.equal(rootNumber([2n, 3n, 1n, 4n, 50n]), 1);
  assert.equal(rootNumber([1n, -1n, 0n, -79n, 289n]), 1);

  // [0,0,1/8,-1/16,0] is obtained from 37a1 by an admissible scaling.
  assert.equal(
    flint.ecRootNumber(
      0n, 1n, 0n, 1n, 1n, 8n, -1n, 16n, 0n, 1n,
    ),
    -1,
  );
});

test("smalljac tiny-prime traces remain signed on every native ABI", () => {
  assert.equal(flint.ecApIntegral(1n, 2n, 3n, 4n, 999n, 2n), 1);
  const coefficients = flint.ecAnlistIntegral(
    1n, 2n, 3n, 4n, 999n, 430250329n, 16n,
  );
  assert.deepEqual(
    Array.from(coefficients, String),
    [
      "0", "1", "1", "0", "-1", "2", "0", "-1", "-3",
      "-3", "2", "-4", "0", "-4", "-1", "0", "-1",
    ],
  );
});

test("completed central jet has canonical normalization and exact parity", () => {
  const a37 = flint.ecAnlistIntegral(0n, 0n, 1n, -1n, 0n, 37n, 100n);
  const odd = flint.ecCompletedCentralDerivatives(37n, -1, a37, 0, 3, 80);
  assert.equal(odd.status, "ok");
  assert.equal(odd.rigorous, false);
  assert.equal(
    odd.analyticErrorStatus,
    "coefficient_and_grid_omission_only",
  );
  assert.equal(odd.derivatives[0].midpoint, "0");
  assert.equal(odd.derivatives[2].midpoint, "0");
  relativeClose(odd.derivatives[1].midpoint, 0.29623890869980074, 1e-10);
  assert.ok(Number(odd.tailBound) >= 0);
  assert.ok(Number(odd.gridOmissionBound) > 0);
  assert.ok(Number(odd.coefficientTailBound) >= 0);
  assert.ok(
    Number(odd.tailBound) >=
      (Number(odd.gridOmissionBound) + Number(odd.coefficientTailBound)) *
        (1 - 1e-12),
  );

  // Only completed Lambda is parity-pure. Raw L''(1) for 37a1 is nonzero;
  // completed-to-raw gamma convolution deliberately remains in Python.
  assert.deepEqual(odd.derivatives.map((entry) => entry.order), [0, 1, 2]);

  const a11 = flint.ecAnlistIntegral(0n, -1n, 1n, -10n, -20n, 11n, 100n);
  const even = flint.ecCompletedCentralDerivatives(11n, 1, a11, 0, 3, 80);
  assert.equal(even.status, "ok");
  relativeClose(even.derivatives[0].midpoint, 0.1339922614700939, 1e-10);
  assert.equal(even.derivatives[1].midpoint, "0");
});

test("Molin jet reports coefficient sufficiency and rank-two normalization", () => {
  const coefficients = flint.ecAnlistIntegral(
    2n, 3n, 1n, 4n, 50n, 1008811n, 10000n,
  );
  const jet = flint.ecCompletedCentralDerivatives(
    1008811n, 1, coefficients, 0, 3, 64,
  );
  assert.equal(jet.status, "ok");
  assert.ok(jet.requiredCutoff > 6000);
  assert.equal(jet.cutoff, jet.requiredCutoff);
  assert.equal(jet.derivatives[1].midpoint, "0");
  assert.ok(Math.abs(Number(jet.derivatives[0].midpoint)) < 1e-7);
  relativeClose(jet.derivatives[2].midpoint, 2358.6936367551216, 1e-8);
  assert.ok(
    jet.coefficientTerms < (jet.cutoff * jet.gridPoints) / 5,
    `variable grid used ${jet.coefficientTerms} coefficient terms`,
  );

  const short = flint.ecCompletedCentralDerivatives(
    1008811n, 1, coefficients.slice(0, 101), 0, 3, 64,
  );
  assert.equal(short.status, "insufficient_coefficients");
  assert.equal(short.cutoff, 100);
  assert.equal(short.requiredCutoff, jet.requiredCutoff);
});

test("completed central jet rejects invalid and unsupported resource inputs", () => {
  assert.throws(
    () => flint.ecCompletedCentralDerivatives(37n, 0, [0, 1], 0, 1, 64),
    /root number/,
  );
  assert.throws(
    () => flint.ecCompletedCentralDerivatives(10n ** 10000n, 1, [0, 1], 0, 1, 64),
    /resource limits/,
  );
});

test("genus-2/3 Arb boundary plans packed coefficients and returns balls", () => {
  const probe = flint.hyperellipticLseriesValues(
    713n,
    1,
    2,
    new Int32Array([0, 1]),
    [["1", "0"]],
    32,
    2,
  );
  assert.equal(probe.status, "insufficient_coefficients");
  assert.ok(probe.requiredCutoff > 64);

  const coefficients = new Int32Array(probe.requiredCutoff + 1);
  coefficients[1] = 1;
  const result = flint.hyperellipticLseriesValues(
    713n,
    1,
    2,
    coefficients,
    [["1", "0"]],
    32,
    2,
  );
  assert.equal(result.status, "ok");
  assert.equal(result.rigorous, false);
  assert.equal(result.genus, 2);
  assert.equal(result.values.length, 1);
  assert.equal(result.values[0].rawDerivatives.length, 3);
  assert.equal(result.values[0].completedDerivatives.length, 3);
  assert.equal(result.values[0].completedDerivatives[1].realMidpoint, "0");
  assert.equal(result.values[0].completedDerivatives[1].imagMidpoint, "0");
  assert.ok(Number(result.values[0].rawDerivatives[0].realRadius) >= 0);
  assert.match(result.analyticErrorStatus, /nested_inverse_mellin/);
});

test("genus-2/3 central weights return packed completed and raw jets", () => {
  const probe = flint.hyperellipticCentralWeights(
    713n, 1, 2, new Int32Array([0, 1]), 32, 4,
  );
  assert.equal(probe.status, "insufficient_coefficients");
  assert.ok(probe.requiredCutoff >= probe.coarseCutoff);
  assert.ok(probe.contourPoints >= probe.coarseContourPoints);
  assert.equal(probe.contourReal, 2);

  const highPrecisionProbe = flint.hyperellipticCentralWeights(
    713n, 1, 2, new Int32Array([0, 1]), 200, 4,
  );
  assert.equal(highPrecisionProbe.status, "insufficient_coefficients");
  assert.equal(highPrecisionProbe.contourReal, 3);

  const coefficients = new Int32Array(probe.requiredCutoff + 1);
  coefficients[1] = 1;
  const result = flint.hyperellipticCentralWeights(
    713n, 1, 2, coefficients, 32, 4,
  );
  assert.equal(result.status, "ok");
  assert.equal(result.algorithm, "central-mellin-weights");
  assert.equal(result.completedDerivatives.length, 5);
  assert.equal(result.rawDerivatives.length, 5);
  assert.equal(result.completedDerivatives[1].realMidpoint, "0");
  assert.equal(result.completedDerivatives[3].realMidpoint, "0");
  assert.equal(result.rigorous, false);
  assert.match(result.analyticErrorStatus, /central_weight_contour/);
  assert.ok(result.coefficientTerms > 0);
  assert.equal(result.sharedCoefficientLogarithms, 1);
  assert.equal(result.coarsePhaseUpdates, result.coarseContourPoints + 1);
  assert.equal(result.finePhaseUpdates, result.contourPoints + 1);
  assert.ok(result.coefficientTraversalCpuSeconds >= 0);
  assert.ok(result.coarseCompletionCpuSeconds >= 0);
  assert.ok(result.fineCompletionCpuSeconds >= 0);
});

test("paired central grids retain the independent-grid numerical oracle", () => {
  const probe = flint.hyperellipticCentralWeights(
    713n, 1, 2, new Int32Array([0, 1]), 64, 4,
  );
  const coefficients = new Int32Array(probe.requiredCutoff + 1);
  coefficients[1] = 1;
  for (let index = 2; index < coefficients.length; index += 1) {
    coefficients[index] = ((index * 17 + 5) % 23) - 11;
  }
  const result = flint.hyperellipticCentralWeights(
    713n, 1, 2, coefficients, 64, 4,
  );
  assert.equal(result.status, "ok");
  const nonzero = coefficients.reduce(
    (count, coefficient) => count + Number(coefficient !== 0),
    0,
  );
  assert.equal(result.sharedCoefficientLogarithms, nonzero);
  assert.equal(
    result.coarsePhaseUpdates,
    nonzero * (result.coarseContourPoints + 1),
  );
  assert.equal(
    result.finePhaseUpdates,
    nonzero * (result.contourPoints + 1),
  );
  assert.equal(
    result.rawDerivatives[0].realMidpoint,
    "0.75376413529298505392564115787040",
  );
  assert.equal(
    result.rawDerivatives[4].realMidpoint,
    "4.2928121643628384998414410420705",
  );
  assert.equal(
    result.completedDerivatives[2].realMidpoint,
    "0.31292051296699307030470448036596",
  );
  assert.equal(
    result.completedDerivatives[4].realMidpoint,
    "0.63750381200009793494268854314495",
  );
  assert.ok(result.refinementStable);
});

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

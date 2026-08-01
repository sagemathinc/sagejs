"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const flint = require("..");

test("native Eisenstein series use exact FLINT divisor sums", () => {
  const linear = flint.qqEisensteinSeries(12, 8, "linear");
  assert.deepEqual(
    flint.polyCoefficients(linear).slice(0, 5),
    [
      { numerator: 691n, denominator: 65520n },
      { numerator: 1n, denominator: 1n },
      { numerator: 2049n, denominator: 1n },
      { numerator: 177148n, denominator: 1n },
      { numerator: 4196353n, denominator: 1n },
    ],
  );

  assert.equal(
    flint.polyToString(
      flint.qqEisensteinSeries(12, 5, "integral"),
      "q",
    ),
    "274945048560*q^4 + 11606736960*q^3 + " +
      "134250480*q^2 + 65520*q + 691",
  );
  assert.equal(
    flint.polyToString(
      flint.qqEisensteinSeries(4, 4, "constant"),
      "q",
    ),
    "6720*q^3 + 2160*q^2 + 240*q + 1",
  );
});

test("native polynomial inflation implements q to q^d", () => {
  const series = flint.qqEisensteinSeries(4, 3, "constant");
  assert.equal(
    flint.polyToString(flint.polyInflate(series, 11n), "q"),
    "2160*q^22 + 240*q^11 + 1",
  );
  assert.throws(() => flint.polyInflate(series, 0n), /positive/);
});

test("native Eisenstein boundary validates its parameters", () => {
  assert.throws(
    () => flint.qqEisensteinSeries(3, 5, "linear"),
    /positive even/,
  );
  assert.throws(
    () => flint.qqEisensteinSeries(4, 5, "unknown"),
    /normalization/,
  );
});

test("native character Manin presentations retain cyclotomic scalars", () => {
  const p1 = flint.p1List(13);
  const group = flint.dirichletGroup(13n);
  const full = flint.p1ListCharacterPresentation(
    p1, 2, 0, group, 2n,
  );
  const plus = flint.p1ListCharacterPresentation(
    p1, 2, 1, group, 2n,
  );
  const minus = flint.p1ListCharacterPresentation(
    p1, 2, -1, group, 2n,
  );
  assert.deepEqual(
    [full.dimension, plus.dimension, minus.dimension],
    [4, 3, 1],
  );
  assert.deepEqual(
    [full.generators, full.basisGenerators.length],
    [14, 4],
  );
  global.gc();
  const reduction = flint.characterPresentationReduction(full);
  assert.equal(flint.matrixRank(reduction), 4);
  const t2 = flint.p1ListCharacterHeckeMatrix(
    p1, 2, 0, 2, group, 2n, full,
  );
  assert.equal(flint.matrixRank(t2), 4);
  const legacyT2 = flint.p1ListCharacterHeckeMatrix(
    p1, 2, 0, 2, group, 2n,
  );
  assert.equal(flint.matrixEqual(t2, legacyT2), true);
  assert.throws(
    () => flint.p1ListCharacterHeckeMatrix(
      p1, 2, 0, 2, group, 1n, full,
    ),
    /does not match level, weight, sign, and character/,
  );
  assert.throws(
    () => flint.p1ListCharacterHeckeMatrix(
      p1, 2, 0, 2, group, 2n, {},
    ),
    /expected a retained character presentation/,
  );
});

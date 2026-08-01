import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { formatFactorization, instantiateFlintFactor } from "../index.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const flint = await instantiateFlintFactor(wasm);

test("factors integers through the browser-compatible WASM boundary", () => {
  assert.deepEqual(flint.factor(2026n), {
    sign: 1,
    factors: [
      [2n, 1],
      [1013n, 1],
    ],
  });
  assert.equal(formatFactorization(flint.factor(2026n)), "2 * 1013");
});

test("preserves signs, exponents, units, and arbitrary precision", () => {
  assert.equal(formatFactorization(flint.factor(-12n)), "-1 * 2^2 * 3");
  assert.deepEqual(flint.factor(1n), { sign: 1, factors: [] });
  assert.deepEqual(flint.factor(-1n), { sign: -1, factors: [] });
  assert.equal(
    formatFactorization(flint.factor(923098402834028349082348209385n)),
    "5 * 43 * 3271 * 1312589710612682771192009",
  );
});

test("supports FLINT quadratic-sieve temporary files through WASI", () => {
  assert.equal(
    formatFactorization(flint.factor(2027n ** 22n - 1n)),
    "2^3 * 3 * 13^2 * 23 * 947 * 1013 * 8009 * 524701 * " +
      "102509021429236628338837 * 146131886639829984132902603887",
  );
});

test("rejects zero and lossy JavaScript numbers", () => {
  assert.throws(() => flint.factor(0), /cannot factor zero/);
  assert.throws(
    () => flint.factor(Number.MAX_SAFE_INTEGER + 1),
    /safe integer/,
  );
});

test("tests primality and finds proven next primes", () => {
  assert.equal(flint.isPrime(2n), true);
  assert.equal(flint.isPrime(15n), false);
  assert.equal(flint.isPrime(-7n), false);
  assert.equal(flint.nextPrime(1000n), 1009n);
  assert.equal(
    flint.nextPrime(2n ** 128n),
    340282366920938463463374607431768211507n,
  );
});

test("shares the native P1 and weight-2 modular-symbol core", () => {
  assert.deepEqual(flint.modularSymbolsWeight2Info(389), {
    level: 389,
    p1Count: 390,
    dimension: 65,
    fareyCusps: 131,
    p1Checksum: 15155406781064202873n,
  });
  assert.deepEqual(flint.modularSymbolsWeight2Info(1000), {
    level: 1000,
    p1Count: 1800,
    dimension: 301,
    fareyCusps: 601,
    p1Checksum: 4376806799976598043n,
  });
  assert.throws(
    () => flint.modularSymbolsWeight2Info(0),
    /level must be between/,
  );
});

test("provides exact portable polynomial construction and arithmetic", () => {
  const x = flint.qqPolyGen();
  const two = flint.qqPolyConstant(2n, 1n);
  const one = flint.qqPolyConstant(1n, 1n);
  const value = flint.polyAdd(
    flint.polySub(
      flint.polyPow(x, 2n),
      flint.polyMul(two, x),
    ),
    one,
  );
  assert.equal(flint.polyToString(x, "x"), "x");
  assert.deepEqual(flint.polyCoefficients(x), [
    { numerator: 0n, denominator: 1n },
    { numerator: 1n, denominator: 1n },
  ]);
  assert.equal(
    flint.polyToString(value, "x"),
    "x^2 - 2*x + 1",
  );
  assert.equal(
    flint.polyToString(flint.qqPolyConstant(2n, 3n), "x"),
    "2/3",
  );
  assert.equal(
    flint.polyToString(
      flint.zzPolyToQQ(flint.zzPolyConstant(-5n)),
      "x",
    ),
    "-5",
  );
  assert.ok(
    flint.polyEqual(
      value,
      flint.polyPow(flint.polySub(x, one), 2n),
    ),
  );

  const z = flint.nmodPolyGen(5n);
  const reduced = flint.polyAdd(
    flint.polyPow(z, 2n),
    flint.nmodPolyConstant(6n, 5n),
  );
  assert.equal(flint.polyToString(reduced, "z"), "z^2 + 1");
});

test("provides portable exact matrices over composite residue rings", () => {
  const matrix = flint.zmodMatrix(
    2, 2, [2n, 3n, 3n, 2n], 36n);
  assert.equal(flint.matrixDet(matrix), 31n);
  assert.deepEqual(
    flint.matrixCharpoly(matrix), [31n, 32n, 1n]);
  const inverse = flint.matrixInverse(matrix);
  assert.ok(flint.matrixEqual(
    flint.matrixMul(matrix, inverse),
    flint.zmodMatrix(2, 2, [1n, 0n, 0n, 1n], 36n),
  ));

  const source = flint.zmodMatrix(
    3,
    4,
    [1n, 2n, 3n, 4n, 0n, 5n, 5n, 6n, 0n, 0n, 0n, 25n],
    625n,
  );
  assert.equal(flint.matrixRank(source), 1);
  const howell = flint.matrixHowell(source);
  assert.deepEqual(
    Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, col) =>
        flint.matrixEntry(howell, row, col))),
    [
      [1n, 2n, 3n, 4n],
      [0n, 5n, 5n, 6n],
      [0n, 0n, 0n, 25n],
      [0n, 0n, 0n, 0n],
    ],
  );
  const kernel = flint.matrixRightKernel(source);
  assert.ok(flint.matrixEqual(
    flint.matrixMul(source, flint.matrixTranspose(kernel)),
    flint.zmodMatrix(3, 3, Array(9).fill(0n), 625n),
  ));
});

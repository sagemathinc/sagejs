"use strict";

const assert = require("node:assert/strict");
const flint = require("..");

assert.equal(flint.version(), "3.5.0");
assert.equal(flint.nativeAbiVersion(), 1);
assert.equal(flint.mpfrVersion(), "4.2.2");
assert.equal(flint.mpcVersion(), "1.4.1");
assert.match(flint.gmpVersion(), /^6\./);

for (const value of [
  0n,
  1n,
  -1n,
  2n ** 63n - 1n,
  2n ** 63n,
  -(2n ** 200n + 123456789n),
  2n ** 4096n - 1n,
]) {
  assert.equal(flint.identity(value), value);
}

assert.equal(flint.gcd(0n, 0n), 0n);
assert.equal(flint.gcd(-48n, 180n), 12n);
assert.equal(flint.factorial(100), 93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n);
assert.equal(flint.fibonacci(100), 354224848179261915075n);
assert.equal(flint.binomial(100, 50), 100891344545564193334812497256n);
assert.equal(flint.primorial(20), 9699690n);
assert.deepEqual(flint.factor(-360n), {
  sign: -1,
  factors: [
    [2n, 3],
    [3n, 2],
    [5n, 1],
  ],
});
assert.deepEqual(flint.factor(2n ** 64n - 1n), {
  sign: 1,
  factors: [
    [3n, 1],
    [5n, 1],
    [17n, 1],
    [257n, 1],
    [641n, 1],
    [65537n, 1],
    [6700417n, 1],
  ],
});

assert.throws(() => flint.identity(1), /BigInt/);
assert.throws(() => flint.factor(0n), /factor zero/);
assert.throws(() => flint.factorial(1n), /Number/);
assert.throws(() => flint.factorial(-1), /nonnegative/);

const zx = flint.zzPolyGen();
const zone = flint.zzPolyConstant(1n);
const zf = flint.polyPow(flint.polyAdd(zx, zone), 3n);
assert.equal(flint.polyToString(zf, "x"), "x^3+3*x^2+3*x+1");
assert.deepEqual(flint.polyCoefficients(zf), [1n, 3n, 3n, 1n]);
assert.equal(flint.polyEqual(zf, zf), true);

const qx = flint.zzPolyToQQ(zx);
const third = flint.qqPolyConstant(1n, 3n);
const qf = flint.polyAdd(flint.polyAdd(qx, flint.qqPolyConstant(1n, 1n)), third);
assert.equal(flint.polyToString(qf, "x"), "x+4/3");
assert.deepEqual(flint.polyCoefficients(qf), [
  { numerator: 4n, denominator: 3n },
  { numerator: 1n, denominator: 1n },
]);
assert.equal(
  flint.polyEqual(qf, flint.polyAdd(qx, flint.qqPolyConstant(4n, 3n))),
  true,
);
assert.throws(() => flint.polyAdd(zx, qx), /different base rings/);
assert.throws(
  () => flint.polyAdd(zx, {}),
  /expected a Sage\.js FLINT polynomial/,
);
assert.throws(() => flint.qqPolyConstant(1n, 0n), /denominator is zero/);

assert.equal(flint.wordIsPrime(2n), true);
assert.equal(flint.wordIsPrime(18446744073709551557n), true);
assert.equal(flint.wordIsPrime(15n), false);
assert.equal(flint.isPrime(2n), true);
assert.equal(flint.isPrime(15n), false);
assert.equal(
  flint.isPrime(
    115792089237316195423570985008687907853269984665640564039457584007913129640233n,
  ),
  true,
);
assert.equal(flint.nextPrime(1000n), 1009n);
assert.equal(
  flint.nextPrime(2n ** 256n),
  115792089237316195423570985008687907853269984665640564039457584007913129640233n,
);
assert.equal(flint.wordPrimitiveRootPrime(2n), 1n);
assert.equal(flint.wordPrimitiveRootPrime(1009n), 11n);

const fq9 = flint.fqContext(3n, 2, "a");
const fq9gen = flint.fqGen(fq9);
const fq9one = flint.fqFromBigInt(fq9, 1n);
assert.deepEqual(flint.fqContextModulus(fq9), [2n, 2n, 1n]);
assert.equal(flint.fqToString(fq9gen), "a");
assert.equal(flint.fqToString(flint.fqMul(fq9gen, fq9gen)), "a+1");
assert.equal(flint.fqToString(flint.fqAdd(fq9gen, fq9one)), "a+1");
assert.equal(
  flint.fqToString(flint.fqSub(flint.fqAdd(fq9gen, fq9one), fq9gen)),
  "1",
);
assert.equal(flint.fqToString(flint.fqNeg(fq9gen)), "2*a");
assert.equal(flint.fqToString(flint.fqDiv(fq9one, fq9gen)), "a+2");
assert.equal(flint.fqToString(flint.fqPow(fq9gen, -1n)), "a+2");
assert.equal(flint.fqToString(flint.fqPow(fq9gen, 8n)), "1");
assert.equal(flint.fqIsZero(flint.fqFromBigInt(fq9, 9n)), true);
assert.equal(flint.fqIsOne(flint.fqFromBigInt(fq9, 4n)), true);
assert.equal(flint.fqEqual(fq9gen, fq9gen), true);
assert.throws(
  () => flint.fqDiv(fq9one, flint.fqFromBigInt(fq9, 0n)),
  /division by zero/,
);
assert.throws(
  () => flint.fqAdd(fq9gen, flint.fqGen(flint.fqContext(3n, 2, "b"))),
  /different parents/,
);
assert.throws(() => flint.fqContext(3n, 1, "a"), /degree/);
assert.throws(() => flint.fqContext(65537n, 2, "a"), /Conway polynomial/);

const nmod5x = flint.nmodPolyGen(5n);
const nmod5one = flint.nmodPolyConstant(1n, 5n);
const nmod5f = flint.polySub(flint.polyPow(nmod5x, 4n), nmod5one);
assert.equal(flint.polyToString(nmod5f, "x"), "x^4+4");
assert.equal(
  flint.polyToString(
    flint.nmodPolyGcd(
      nmod5f,
      flint.polyPow(flint.polySub(nmod5x, nmod5one), 2n),
    ),
    "x",
  ),
  "x+4",
);
assert.equal(
  flint.nmodPolyIsIrreducible(
    flint.polyAdd(
      flint.polyPow(nmod5x, 2n),
      flint.nmodPolyConstant(2n, 5n),
    ),
  ),
  true,
);
const nmod5factorization = flint.nmodPolyFactor(nmod5f);
assert.equal(nmod5factorization.unit, 1n);
assert.deepEqual(
  nmod5factorization.factors
    .map(([factor, exponent]) => [
      flint.polyToString(factor, "x"),
      exponent,
    ])
    .sort(),
  [
    ["x+1", 1],
    ["x+2", 1],
    ["x+3", 1],
    ["x+4", 1],
  ],
);
const nmod5g = flint.polyMul(
  flint.polyPow(flint.polySub(nmod5x, nmod5one), 2n),
  flint.polyAdd(nmod5x, flint.nmodPolyConstant(2n, 5n)),
);
assert.deepEqual(flint.nmodPolyRoots(nmod5g), [
  [3n, 1],
  [1n, 2],
]);
assert.equal(
  flint.polyToString(
    flint.zzPolyToNmod(flint.zzPolyConstant(-7n), 5n),
    "x",
  ),
  "3",
);
assert.throws(
  () => flint.polyAdd(nmod5x, flint.nmodPolyGen(7n)),
  /different finite fields/,
);
assert.throws(() => flint.nmodPolyGen(4n), /modulus must be prime/);

const zzx = flint.zzPolyGen();
const zzone = flint.zzPolyConstant(1n);
const zzfive = flint.zzPolyConstant(5n);
const zzpolynomial = flint.polyMul(
  flint.polySub(flint.polyPow(zzx, 2n), zzone),
  flint.polyMul(
    flint.polyAdd(flint.polyPow(zzx, 3n), flint.zzPolyConstant(2n)),
    flint.polySub(zzx, zzfive),
  ),
);
const zzfactorization = flint.polyFactor(zzpolynomial);
assert.equal(zzfactorization.unitNumerator, 1n);
assert.equal(zzfactorization.unitDenominator, 1n);
assert.deepEqual(
  zzfactorization.factors.map(([factor, exponent]) => [
    flint.polyToString(factor, "x"),
    exponent,
  ]),
  [
    ["x-1", 1],
    ["x+1", 1],
    ["x-5", 1],
    ["x^3+2", 1],
  ],
);
assert.ok(
  flint.polyEqual(
    flint.polyDivExact(zzpolynomial, flint.polySub(zzx, zzfive)),
    flint.polyMul(
      flint.polySub(flint.polyPow(zzx, 2n), zzone),
      flint.polyAdd(flint.polyPow(zzx, 3n), flint.zzPolyConstant(2n)),
    ),
  ),
);
assert.throws(
  () => flint.polyDivExact(zzpolynomial, flint.polyAdd(zzx, zzfive)),
  /not exact/,
);

const qqx = flint.qqPolyGen();
const qqpolynomial = flint.polyMul(
  flint.qqPolyConstant(3n, 10n),
  flint.polyMul(
    flint.polyPow(
      flint.polySub(qqx, flint.qqPolyConstant(1n, 1n)),
      2n,
    ),
    flint.polyAdd(qqx, flint.qqPolyConstant(2n, 1n)),
  ),
);
const qqfactorization = flint.polyFactor(qqpolynomial);
assert.equal(qqfactorization.unitNumerator, 3n);
assert.equal(qqfactorization.unitDenominator, 10n);
assert.deepEqual(
  qqfactorization.factors.map(([factor, exponent]) => [
    flint.polyToString(factor, "x"),
    exponent,
  ]),
  [
    ["x+2", 1],
    ["x-1", 2],
  ],
);

const r53 = flint.realFromString("1.2", 53);
const r100 = flint.realFromRational(1n, 3n, 100);
assert.equal(flint.realPrecision(r53), 53);
assert.equal(flint.realToString(r53), "1.20000000000000");
assert.equal(flint.realToDouble(r53), 1.2);
assert.equal(
  flint.realToString(r100),
  "0.33333333333333333333333333333",
);
assert.equal(
  flint.realToString(
    flint.realDiv(
      flint.realFromBigInt(1n, 53),
      flint.realFromBigInt(0n, 53),
    ),
  ),
  "+infinity",
);
assert.equal(
  flint.realToString(flint.realPowInt(flint.realFromBigInt(2n, 53), -3n)),
  "0.125000000000000",
);

const c53 = flint.complexFromReals(
  flint.realFromBigInt(1n, 53),
  flint.realFromBigInt(2n, 53),
);
assert.equal(flint.complexPrecision(c53), 53);
assert.equal(flint.complexRealDouble(c53), 1);
assert.equal(flint.complexImagDouble(c53), 2);
assert.equal(
  flint.realToString(flint.complexReal(c53)),
  "1.00000000000000",
);
assert.equal(
  flint.realToString(flint.complexImag(c53)),
  "2.00000000000000",
);
assert.equal(
  flint.complexToString(c53),
  "1.00000000000000 + 2.00000000000000*I",
);
assert.equal(
  flint.complexToString(flint.complexPowInt(c53, -2n)),
  "-0.120000000000000 - 0.160000000000000*I",
);
assert.equal(
  flint.complexToString(flint.complexEi(c53)),
  "1.04216770816494 + 3.70150142593787*I",
);
assert.deepEqual(
  flint.zetaZeros(3, 53).map((value) => value.toFixed(12)),
  ["14.134725141735", "21.022039638772", "25.010857580146"],
);

const integerMatrix = flint.zzMatrix(2, 2, [1n, 2n, 3n, 4n]);
assert.equal(flint.matrixEntry(integerMatrix, 0, 1), 2n);
assert.equal(flint.matrixDet(integerMatrix), -2n);
assert.equal(flint.matrixRank(integerMatrix), 2);
const integerRref = flint.matrixRref(integerMatrix);
assert.deepEqual(
  flint.matrixEntry(integerRref, 0, 0),
  { numerator: 1n, denominator: 1n },
);
assert.deepEqual(
  flint.matrixEntry(integerRref, 1, 1),
  { numerator: 1n, denominator: 1n },
);
const integerHermite = flint.matrixHermite(integerMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      integerHermite,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [1n, 0n, 0n, 2n],
);
const [integerHermiteWithTransform, integerHermiteTransform] =
  flint.matrixHermiteTransform(integerMatrix);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(integerHermiteTransform, integerMatrix),
    integerHermiteWithTransform,
  ),
  true,
);
const [integerSmith, integerSmithLeft, integerSmithRight] =
  flint.matrixSmith(integerMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      integerSmith,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [1n, 0n, 0n, 2n],
);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(
      flint.matrixMul(integerSmithLeft, integerMatrix),
      integerSmithRight,
    ),
    integerSmith,
  ),
  true,
);
assert.deepEqual(
  flint.matrixCharpoly(integerMatrix),
  [-2n, -5n, 1n],
);
const dependentMatrix = flint.zzMatrix(
  2,
  3,
  [1n, 2n, 3n, 2n, 4n, 6n],
);
const integerKernel = flint.matrixRightKernel(dependentMatrix);
assert.deepEqual(
  Array.from({ length: 6 }, (_, index) =>
    flint.matrixEntry(
      integerKernel,
      Math.floor(index / 3),
      index % 3,
    ),
  ),
  [1n, 1n, -1n, 0n, 3n, -2n],
);
const integerSquare = flint.matrixMul(integerMatrix, integerMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      integerSquare,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [7n, 10n, 15n, 22n],
);
const rationalInverse = flint.matrixInverse(integerMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      rationalInverse,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [
    { numerator: -2n, denominator: 1n },
    { numerator: 1n, denominator: 1n },
    { numerator: 3n, denominator: 2n },
    { numerator: -1n, denominator: 2n },
  ],
);
assert.throws(
  () => flint.matrixInverse(flint.zzMatrix(2, 2, [1n, 2n, 2n, 4n])),
  /singular/,
);

const finiteMatrix = flint.nmodMatrix(
  2, 2, [1n, 2n, 3n, 4n], 5n);
assert.equal(flint.matrixEntry(finiteMatrix, 1, 0), 3n);
assert.equal(flint.matrixDet(finiteMatrix), 3n);
assert.equal(flint.matrixRank(finiteMatrix), 2);
assert.deepEqual(flint.matrixCharpoly(finiteMatrix), [3n, 0n, 1n]);
const finiteInverse = flint.matrixInverse(finiteMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      finiteInverse,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [3n, 1n, 4n, 2n],
);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(finiteMatrix, finiteInverse),
    flint.nmodMatrix(2, 2, [1n, 0n, 0n, 1n], 5n),
  ),
  true,
);
const finiteDependent = flint.nmodMatrix(
  2, 3, [1n, 2n, 3n, 2n, 4n, 1n], 5n);
const finiteKernel = flint.matrixRightKernel(finiteDependent);
assert.equal(flint.matrixRank(finiteKernel), 2);
assert.equal(
  flint.matrixRank(
    flint.matrixMul(
      finiteDependent,
      flint.matrixTranspose(finiteKernel),
    ),
  ),
  0,
);

const residueMatrix = flint.zmodMatrix(
  2, 2, [2n, 3n, 3n, 2n], 36n);
assert.equal(flint.matrixDet(residueMatrix), 31n);
assert.deepEqual(
  flint.matrixCharpoly(residueMatrix), [31n, 32n, 1n]);
const residueInverse = flint.matrixInverse(residueMatrix);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(residueMatrix, residueInverse),
    flint.zmodMatrix(2, 2, [1n, 0n, 0n, 1n], 36n),
  ),
  true,
);
const residueHowellSource = flint.zmodMatrix(
  3,
  4,
  [1n, 2n, 3n, 4n, 0n, 5n, 5n, 6n, 0n, 0n, 0n, 25n],
  625n,
);
const residueHowell = flint.matrixHowell(residueHowellSource);
assert.equal(flint.matrixRank(residueHowellSource), 1);
assert.deepEqual(
  [0, 1, 2, 3].map((row) =>
    [0, 1, 2, 3].map((col) =>
      flint.matrixEntry(residueHowell, row, col))),
  [
    [1n, 2n, 3n, 4n],
    [0n, 5n, 5n, 6n],
    [0n, 0n, 0n, 25n],
    [0n, 0n, 0n, 0n],
  ],
);
const residueKernel = flint.matrixRightKernel(residueHowellSource);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(
      residueHowellSource,
      flint.matrixTranspose(residueKernel),
    ),
    flint.zmodMatrix(3, 3, Array(9).fill(0n), 625n),
  ),
  true,
);

console.log("Native FLINT arithmetic and BigInt conversion passed.");

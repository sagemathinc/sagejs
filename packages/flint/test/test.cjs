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
assert.equal(flint.polyEqual(zf, zf), true);

const qx = flint.zzPolyToQQ(zx);
const third = flint.qqPolyConstant(1n, 3n);
const qf = flint.polyAdd(flint.polyAdd(qx, flint.qqPolyConstant(1n, 1n)), third);
assert.equal(flint.polyToString(qf, "x"), "x+4/3");
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

const r53 = flint.realFromString("1.2", 53);
const r100 = flint.realFromRational(1n, 3n, 100);
assert.equal(flint.realPrecision(r53), 53);
assert.equal(flint.realToString(r53), "1.20000000000000");
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
assert.equal(
  flint.complexToString(c53),
  "1.00000000000000 + 2.00000000000000*I",
);
assert.equal(
  flint.complexToString(flint.complexPowInt(c53, -2n)),
  "-0.120000000000000 - 0.160000000000000*I",
);

console.log("Native FLINT arithmetic and BigInt conversion passed.");

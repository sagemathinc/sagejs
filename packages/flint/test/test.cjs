"use strict";

const assert = require("node:assert/strict");
const flint = require("..");

assert.equal(flint.version(), "3.5.0");

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

console.log("Native FLINT arithmetic and BigInt conversion passed.");

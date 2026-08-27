// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

function canonical(value, prime) {
  const reduced = value % prime;
  return reduced < 0 ? reduced + prime : reduced;
}

function multiply(left, right, prime, modulus0, modulus1) {
  const quadratic = left[1] * right[1];
  return [
    canonical(left[0] * right[0] - quadratic * modulus0, prime),
    canonical(
      left[0] * right[1] + left[1] * right[0] - quadratic * modulus1,
      prime,
    ),
  ];
}

function affineOracle(count) {
  let value = [1, 2];
  const multiplier = [3, 4];
  const increment = [5, 6];
  for (let index = 0; index < count; index += 1) {
    const product = multiply(value, multiplier, 97, 5, 1);
    value = [
      canonical(product[0] + increment[0], 97),
      canonical(product[1] + increment[1], 97),
    ];
  }
  return value;
}

const setup = String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2 + x + 5)

def optimized(count):
    value = K(1) + 2*a
    multiplier = K(3) + 4*a
    increment = K(5) + 6*a
    for index in range(count):
        value = value * multiplier + increment
    return value, index

def generic(count):
    value = K(1) + 2*a
    multiplier = K(3) + 4*a
    increment = K(5) + 6*a
    for index in range(count):
        product = value * multiplier
        value = product + increment
    return value, index
`;

test("one verified GF(p^2) region selects V8 and an isolated native target", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(setup + String.raw`
small = optimized(1000)
small_route = K._lastCompilerOptimizationRoute
small_oracle = generic(1000)
large = optimized(10000)
large_route = K._lastCompilerOptimizationRoute
large_oracle = generic(10000)
print(small[0], small[1], small == small_oracle, small_route)
print(large[0], large[1], large == large_oracle, large_route)
print(small[0].parent() is K, large[0].parent() is K)
`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "62*a + 43 999 True v8-extension-tuple",
      "15*a + 81 9999 True native-compiled-source",
      "True True",
    ]);
  } finally {
    session.close();
  }
});

test("GF(p^2) guards reject changed methods and parents outside the exact bound", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(setup + String.raw`
original_mul = K._machineExtensionMul
K._machineExtensionMul = None
K._lastCompilerOptimizationRoute = 'guard-sentinel'
changed = optimized(10)
K._machineExtensionMul = original_mul

Q.<y> = PolynomialRing(GF(200003))
L.<b> = GF(200003^2, modulus=y^2 + y + 1)
print(changed[0], changed[1], K._lastCompilerOptimizationRoute)
print(L._machineExtensionDegree)
`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "8*a + 89 9 guard-sentinel",
      "0",
    ]);
  } finally {
    session.close();
  }
});

test("the quadratic kernel selects native code and rejects malformed buffers", async () => {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(String.raw`
from sagejs.kernels.arithmetic.gf_p2 import packed_gf_p2_affine_recurrence as kernel
from sagejs.native import execution_mode, kernel_uint64_zeros
valid = kernel_uint64_zeros(kernel, 2)
arguments = [valid, 1, 2, 3, 4, 5, 6, 1000, 97, 5, 1]
status = kernel(*arguments)
malformed = kernel_uint64_zeros(kernel, 1)
malformed_status = kernel(malformed, 1, 2, 3, 4, 5, 6, 1, 97, 5, 1)
print(kernel.backendPolicy.kind, execution_mode(kernel, *arguments))
print(status, int(valid[0]), int(valid[1]), malformed_status)
`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "tagged native",
      "0 43 62 1",
    ]);
  } finally {
    session.close();
  }
});

test("the public optimized region agrees with an independent coordinate oracle", async () => {
  const session = await createSage();
  try {
    const count = 12345;
    const result = await session.evaluate(setup + String.raw`
coordinates = optimized(${count})[0]._power_basis_coordinates()
print(tuple(int(coefficient) for coefficient in coordinates))
`);
    assert.equal(result.stdout, `(${affineOracle(count).join(", ")})\n`);
  } finally {
    await session.close();
  }
});

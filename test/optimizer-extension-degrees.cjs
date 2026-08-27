// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

async function sessionAtLevel(level) {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = level;
  try {
    return await createSage();
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

function canonical(value, prime) {
  const result = value % prime;
  return result < 0 ? result + prime : result;
}

function multiply(left, right, prime, modulus) {
  const degree = modulus.length;
  const product = Array(2 * degree - 1).fill(0);
  for (let leftIndex = 0; leftIndex < degree; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < degree; rightIndex += 1) {
      const index = leftIndex + rightIndex;
      product[index] = canonical(
        product[index] + left[leftIndex] * right[rightIndex],
        prime,
      );
    }
  }
  for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
    const factor = product[exponent];
    for (let index = 0; index < degree; index += 1) {
      const resultIndex = exponent - degree + index;
      product[resultIndex] = canonical(
        product[resultIndex] - factor * modulus[index],
        prime,
      );
    }
  }
  return product.slice(0, degree);
}

function affine(count, value, factor, increment, prime, modulus) {
  let result = [...value];
  for (let index = 0; index < count; index += 1) {
    const product = multiply(result, factor, prime, modulus);
    result = product.map((coefficient, coordinate) =>
      canonical(coefficient + increment[coordinate], prime));
  }
  return result;
}

const cases = [
  {
    name: "cubic",
    prime: 5,
    degree: 3,
    modulus: [1, 1, 0],
    polynomial: "x^3+x+1",
    setup: [
      "aa = a*a",
      "value = K(1)+2*a+3*aa",
      "factor = K(2)+a+4*aa",
      "increment = K(3)+4*a+aa",
    ],
    value: [1, 2, 3],
    factor: [2, 1, 4],
    increment: [3, 4, 1],
  },
  {
    name: "quartic",
    prime: 3,
    degree: 4,
    modulus: [2, 1, 0, 0],
    polynomial: "x^4+x+2",
    setup: [
      "aa = a*a",
      "aaa = aa*a",
      "value = K(1)+2*a+aa+2*aaa",
      "factor = K(2)+a+2*aa+aaa",
      "increment = K(1)+a+aa+aaa",
    ],
    value: [1, 2, 1, 2],
    factor: [2, 1, 2, 1],
    increment: [1, 1, 1, 1],
  },
];

function recurrenceSource(item, count) {
  return `
P.<x> = PolynomialRing(GF(${item.prime}))
K.<a> = GF(${item.prime}^${item.degree}, modulus=${item.polynomial})
def recurrence(count):
${item.setup.map((line) => `    ${line}`).join("\n")}
    for index in range(count):
        value = value*factor+increment
    return value, index
answer = recurrence(${count})
print(tuple(answer[0]._machineCoordinates), answer[1], K._lastCompilerOptimizationRoute)
`;
}

test("cubic and quartic affine programs agree with O0 and an independent oracle", async () => {
  for (const item of cases) {
    const count = 733;
    const source = recurrenceSource(item, count);
    const optimized = await sessionAtLevel("O2");
    const generic = await sessionAtLevel("O0");
    try {
      const [fast, slow] = await Promise.all([
        optimized.evaluate(source),
        generic.evaluate(source),
      ]);
      const expected = affine(
        count,
        item.value,
        item.factor,
        item.increment,
        item.prime,
        item.modulus,
      );
      assert.equal(
        fast.stdout,
        `(${expected.join(", ")}) ${count - 1} v8-extension-tuple\n`,
        item.name,
      );
      assert.equal(
        slow.stdout,
        `(${expected.join(", ")}) ${count - 1} generic\n`,
        item.name,
      );
    } finally {
      await Promise.all([optimized.close(), generic.close()]);
    }
  }
});

test("higher-degree Horner and multi-state graphs reuse the same field IR", async () => {
  const source = `
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
values = tuple(K(i)+((i+1)%5)*a+((i*i+2)%5)*aa for i in range(47))
def program(values):
    left = K(1)+a+aa
    right = K(2)+3*a+4*aa
    for coefficient in values:
        left = left*right+coefficient
        right = right-left
        if left == coefficient:
            right = -right
    return left, right
print(program(values))
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    const route = await optimized.evaluate("K._lastCompilerOptimizationRoute");
    assert.equal(route.repr, "'v8-extension-tuple-region'");
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("degree, defining-polynomial, and method guards fail closed", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
def recurrence(count):
    value = K(1)+a+aa
    factor = K(2)+3*a+aa
    increment = K(4)+a+2*aa
    for index in range(count):
        value = value*factor+increment
    return value

saved = K._machineExtensionModulusCoefficients
K._machineExtensionModulusCoefficients = [1,1,0]
K._lastCompilerOptimizationRoute = 'modulus-guard'
print(recurrence(7), K._lastCompilerOptimizationRoute)
K._machineExtensionModulusCoefficients = saved

original_mul = K._machineExtensionMul
K._machineExtensionMul = None
K._lastCompilerOptimizationRoute = 'method-guard'
print(recurrence(7), K._lastCompilerOptimizationRoute)
K._machineExtensionMul = original_mul

Q.<y> = PolynomialRing(GF(3))
L.<b> = GF(3^5, modulus=y^5+2*y+1)
print(L._machineExtensionDegree)
`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "4*a^2 + 4*a + 3 modulus-guard",
      "4*a^2 + 4*a + 3 method-guard",
      "0",
    ]);
  } finally {
    await session.close();
  }
});

test("fixed-degree regions materialize one output rather than per-step resources", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
def recurrence(count):
    value = K(1)+2*a+3*aa
    factor = K(2)+a+4*aa
    increment = K(3)+4*a+aa
    for index in range(count):
        value = value*factor+increment
    return value
before = len(K._nativeResourceChildren)
short = recurrence(10)
after_short = len(K._nativeResourceChildren)
long = recurrence(100000)
after_long = len(K._nativeResourceChildren)
print(short.parent() is K, long.parent() is K, after_short-before, after_long-after_short)
`);
    const match = result.stdout.trim().match(/^True True (\d+) (\d+)$/);
    assert.ok(match, result.stdout);
    assert.ok(Number(match[1]) <= 2, result.stdout);
    assert.ok(Number(match[2]) <= 2, result.stdout);
  } finally {
    await session.close();
  }
});

test("the general fixed-degree kernel is isolated and rejects malformed buffers", async () => {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(String.raw`
from sagejs.kernels.arithmetic.gf_p2 import packed_gf_pk_affine_recurrence as kernel
from sagejs.native import execution_mode, kernel_uint64_buffer, kernel_uint64_zeros
output = kernel_uint64_zeros(kernel, 3)
scratch = kernel_uint64_zeros(kernel, 5)
arguments = [
    output,
    scratch,
    kernel_uint64_buffer(kernel, [1,2,3]),
    kernel_uint64_buffer(kernel, [2,1,4]),
    kernel_uint64_buffer(kernel, [3,4,1]),
    kernel_uint64_buffer(kernel, [1,1,0]),
    3, 733, 5,
]
status = kernel(*arguments)
bad_output = kernel_uint64_zeros(kernel, 2)
malformed = [bad_output] + arguments[1:]
print(status, tuple(int(value) for value in output), execution_mode(kernel, *arguments))
print(kernel(*malformed), tuple(int(value) for value in bad_output))
`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "0 (2, 4, 2) native",
      "1 (0, 0)",
    ]);
  } finally {
    await session.close();
  }
});

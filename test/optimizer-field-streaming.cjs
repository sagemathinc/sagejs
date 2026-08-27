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

test("sequence affine regions agree with O0 across prime and extension fields", async () => {
  const source = String.raw`
def horner(values, point, initial):
    value = initial
    for coefficient in values:
        value = value*point+coefficient
    return value, coefficient

F = GF(101)
prime_values = tuple(F(index^3+7) for index in range(257))
F._lastCompilerOptimizationRoute = 'generic'
print(horner(prime_values, F(37), F(11)))
print(F._lastCompilerOptimizationRoute)

P.<x> = PolynomialRing(GF(5))
K3.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
cubic_values = tuple(K3(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(257))
print(horner(cubic_values, K3(2)+3*a+4*aa, K3(1)+a+aa))
print(K3._lastCompilerOptimizationRoute)

Q.<y> = PolynomialRing(GF(3))
K4.<b> = GF(3^4, modulus=y^4+y+2)
bb = b*b
bbb = bb*b
quartic_values = tuple(K4(index)+((index+1)%3)*b+((index^2+1)%3)*bb+((index^3+2)%3)*bbb for index in range(257))
print(horner(quartic_values, K4(2)+b+2*bb+bbb, K4(1)+2*b+bb+2*bbb))
print(K4._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    const fastLines = fast.stdout.trim().split("\n");
    const slowLines = slow.stdout.trim().split("\n");
    assert.deepEqual(
      fastLines.filter((_line, index) => index % 2 === 0),
      slowLines.filter((_line, index) => index % 2 === 0),
    );
    assert.deepEqual(
      fastLines.filter((_line, index) => index % 2 === 1),
      [
        "v8-number-residue-stream",
        "v8-extension-tuple-stream",
        "v8-extension-tuple-stream",
      ],
    );
    assert.deepEqual(
      slowLines.filter((_line, index) => index % 2 === 1),
      ["generic", "generic", "generic"],
    );
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("the same ring IR preserves zero divisors over composite residue rings", async () => {
  const source = String.raw`
def horner(values, point, initial):
    value = initial
    for coefficient in values:
        value = value*point+coefficient
    return value

R = Zmod(100)
R._lastCompilerOptimizationRoute = 'generic'
values = tuple(R(20*index+25) for index in range(513))
print(horner(values, R(40), R(75)), R._lastCompilerOptimizationRoute)

S = Zmod(94906266)
S._lastCompilerOptimizationRoute = 'generic'
boundary_values = tuple(S(index^2+17) for index in range(257))
print(horner(boundary_values, S(94906265), S(94906264)), S._lastCompilerOptimizationRoute)

T = Zmod(94906267)
T._lastCompilerOptimizationRoute = 'outside-bound'
outside_values = tuple(T(index+3) for index in range(17))
print(horner(outside_values, T(11), T(7)), T._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    const normalize = (stdout) => stdout
      .replaceAll("v8-number-residue-stream", "generic");
    assert.equal(normalize(fast.stdout), slow.stdout);
    assert.deepEqual(fast.stdout.trim().split("\n").map((line) => line.split(" ").at(-1)), [
      "v8-number-residue-stream",
      "v8-number-residue-stream",
      "outside-bound",
    ]);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("a late invalid sequence element restarts the untouched generic loop", async () => {
  const source = String.raw`
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
L.<b> = GF(5^3, modulus=x^3+x^2+1)
aa = a*a
values = tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(127)) + (L(1),)
def horner(values):
    value = K(1)+a+aa
    point = K(2)+3*a+4*aa
    for coefficient in values:
        value = value*point+coefficient
    return value
K._lastCompilerOptimizationRoute = 'late-guard-sentinel'
try:
    horner(values)
except Exception:
    print('caught', K._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    assert.equal(fast.stdout, "caught late-guard-sentinel\n");
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("streaming Horner materializes one result and retains no coefficient copy", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
values = tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(4096))
def horner(values):
    value = K(1)+a+aa
    point = K(2)+3*a+4*aa
    for coefficient in values:
        value = value*point+coefficient
    return value
before = len(K._nativeResourceChildren)
answer = horner(values)
after = len(K._nativeResourceChildren)
print(answer.parent() is K, after-before, K._lastCompilerOptimizationRoute)
`);
    assert.equal(result.stdout, "True 0 v8-extension-tuple-stream\n");
  } finally {
    await session.close();
  }
});

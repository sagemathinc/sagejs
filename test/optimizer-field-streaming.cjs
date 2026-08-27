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

test("guarded reverse views preserve iteration order and final loop targets", async () => {
  const source = String.raw`
def reverse_horner(values, point, initial):
    value = initial
    for coefficient in reversed(values):
        value = value*point+coefficient
    return value, coefficient

R = Zmod(1009)
values = tuple(R(index^3+7) for index in range(257))
R._lastCompilerOptimizationRoute = 'generic'
print(reverse_horner(values, R(37), R(11)))
print(R._lastCompilerOptimizationRoute)

# An ordinary list is deliberately outside the private tuple contract.  The
# failed guard must execute Python's original reversed iterator exactly.
ordinary = [R(2), R(3), R(5), R(7)]
R._lastCompilerOptimizationRoute = 'list-fallback'
print(reverse_horner(ordinary, R(11), R(13)))
print(R._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout.replace("v8-number-residue-stream", "generic"),
      slow.stdout,
    );
    assert.deepEqual(fast.stdout.trim().split("\n").filter((_line, index) => index % 2), [
      "v8-number-residue-stream",
      "list-fallback",
    ]);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("a late invalid reverse-view element restarts the original iterator", async () => {
  const source = String.raw`
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
L.<b> = GF(5^3, modulus=x^3+x^2+1)
aa = a*a
# Reverse iteration sees the incompatible first entry only after consuming
# every valid K entry through private scalar state.
values = (L(1),) + tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(127))
def reverse_horner(values):
    value = K(1)+a+aa
    point = K(2)+3*a+4*aa
    for coefficient in reversed(values):
        value = value*point+coefficient
    return value
K._lastCompilerOptimizationRoute = 'reverse-late-sentinel'
try:
    reverse_horner(values)
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
    assert.equal(fast.stdout, "caught reverse-late-sentinel\n");
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("public extension polynomial evaluation reuses the immutable reverse view", async () => {
  const source = String.raw`
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
R.<t> = PolynomialRing(K)
polynomial = R([K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(1024)])
stored = polynomial._machineFieldCoefficients
point = K(2)+3*a+4*aa
def reference(coefficients, point):
    answer = K(0)
    for coefficient in reversed(list(coefficients)):
        answer = answer*point+coefficient
    return answer
expected = reference(stored, point)
K._lastCompilerOptimizationRoute = 'generic'
before = len(K._nativeResourceChildren)
answers = tuple(polynomial(point) for repeat in range(8))
after = len(K._nativeResourceChildren)
print(answers[-1] == expected, answers[-1] == answers[0], stored is polynomial._machineFieldCoefficients)
print(after-before, K._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  try {
    const fast = await optimized.evaluate(source);
    assert.equal(
      fast.stdout,
      "True True True\n0 v8-extension-tuple-stream\n",
    );
  } finally {
    await optimized.close();
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

test("commutative affine normalization removes source-order sensitivity", async () => {
  const source = String.raw`
R = Zmod(1009)
values = tuple(R(index^2+3*index+11) for index in range(257))

def coefficient_left(values):
    value = R(7)
    point = R(37)
    for coefficient in values:
        value = coefficient + value*point
    return value

def factor_left(values):
    value = R(7)
    point = R(37)
    for coefficient in values:
        value = point*value + coefficient
    return value

def both_commuted(values):
    value = R(7)
    point = R(37)
    for coefficient in values:
        value = coefficient + point*value
    return value

def subtract_increment(values):
    value = R(7)
    point = R(37)
    for coefficient in values:
        value = value*point - coefficient
    return value

for function in (coefficient_left, factor_left, both_commuted, subtract_increment):
    R._lastCompilerOptimizationRoute = 'generic'
    print(function(values), R._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout.replaceAll("v8-number-residue-stream", "generic"),
      slow.stdout,
    );
    assert.equal(
      fast.stdout.match(/v8-number-residue-stream/g)?.length,
      4,
    );
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

test("optimized prime-ring outputs retain the private machine representation brand", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
R = Zmod(1009)
def recurrence(value, count):
    multiplier = R(37)
    increment = R(11)
    for index in range(count):
        value = value*multiplier+increment
    return value
value = R(7)
routes = []
for block in range(8):
    R._lastCompilerOptimizationRoute = 'brand-missing'
    value = recurrence(value, 257)
    routes.append(R._lastCompilerOptimizationRoute)
print(value, routes)
`);
    assert.doesNotMatch(result.stdout, /brand-missing/);
    assert.equal(
      result.stdout.match(/v8-number-residue/g)?.length,
      8,
    );
  } finally {
    await session.close();
  }
});

test("single-use sequence analysis streams guarded dot products", async () => {
  const source = String.raw`
def dot_product(left, right, zero):
    answer = zero
    for index in range(len(left)):
        answer = answer + left[index]*right[index]
    return answer

R = Zmod(1009)
left = tuple(R(index^2+3) for index in range(1025))
right = tuple(R(index^3+7) for index in range(1025))
R._lastCompilerOptimizationRoute = 'generic'
print(dot_product(left, right, R(0)), R._lastCompilerOptimizationRoute)

P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
left_ext = tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(513))
right_ext = tuple(K(index+2)+((index^2+3)%5)*a+((index^3+1)%5)*aa for index in range(513))
K._lastCompilerOptimizationRoute = 'generic'
print(dot_product(left_ext, right_ext, K(0)), K._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout
        .replaceAll("v8-number-residue-stream", "generic")
        .replaceAll("v8-extension-tuple-stream", "generic"),
      slow.stdout,
    );
    assert.match(fast.stdout, /v8-number-residue-stream/);
    assert.match(fast.stdout, /v8-extension-tuple-stream/);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("repeated immutable sequence reads share one guarded streaming load", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
R = Zmod(1009)
values = tuple(R(index^2+3) for index in range(1025))
def sum_of_squares(values):
    answer = R(0)
    for index in range(len(values)):
        answer = answer + values[index]*values[index]
    return answer
print(sum_of_squares(values), R._lastCompilerOptimizationRoute)
`);
    assert.match(result.stdout, /v8-number-residue-stream/);
  } finally {
    await session.close();
  }
});

test("cross-statement commoning preserves writes and control-flow joins", async () => {
  const source = String.raw`
def moments(values, zero):
    left = zero
    right = zero + zero
    for item in values:
        left = left + item*item
        right = right + item*item
    return left, right

def evolving(values, zero, step):
    left = zero
    right = zero + zero
    value = zero + step
    for item in values:
        left = left + value*value
        value = value + step
        right = right + value*value
    return left, right, value

def branching(values, zero, step, pivot):
    left = zero
    right = zero + zero
    value = zero + step
    for item in values:
        left = left + value*value
        if item == pivot:
            value = value + step
        right = right + value*value
    return left, right, value

R = Zmod(1009)
prime_values = tuple(R(index^2+3) for index in range(257))
for function, arguments in (
    (moments, (prime_values, R(0))),
    (evolving, (prime_values, R(0), R(17))),
    (branching, (prime_values, R(0), R(17), prime_values[129])),
):
    R._lastCompilerOptimizationRoute = 'generic'
    print(function(*arguments), R._lastCompilerOptimizationRoute)

P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
cubic_values = tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(257))
step = K(2)+3*a+aa
for function, arguments in (
    (moments, (cubic_values, K(0))),
    (evolving, (cubic_values, K(0), step)),
    (branching, (cubic_values, K(0), step, cubic_values[129])),
):
    K._lastCompilerOptimizationRoute = 'generic'
    print(function(*arguments), K._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout
        .replaceAll("v8-number-residue-stream", "generic")
        .replaceAll("v8-extension-tuple-stream", "generic")
        .replaceAll("v8-number-residue-region", "generic")
        .replaceAll("v8-extension-tuple-region", "generic"),
      slow.stdout,
    );
    assert.equal(fast.stdout.match(/v8-number-residue-stream/g)?.length, 2);
    assert.equal(fast.stdout.match(/v8-extension-tuple-stream/g)?.length, 2);
    assert.equal(fast.stdout.match(/v8-number-residue-region/g)?.length, 1);
    assert.equal(fast.stdout.match(/v8-extension-tuple-region/g)?.length, 1);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("definitely assigned ring locals need no entry value", async () => {
  const source = String.raw`
def staged(values, zero):
    answer = zero
    for item in values:
        square = item*item
        shifted = square+item
        answer = answer+shifted*square
    return answer, square, shifted

def selected(values, zero, pivot):
    answer = zero
    for item in values:
        if item == pivot:
            temporary = item*item
        else:
            temporary = -item
        answer = answer+temporary
    return answer, temporary

R = Zmod(1009)
prime_values = tuple(R(index^2+3) for index in range(257))
R._lastCompilerOptimizationRoute = 'generic'
print(staged(prime_values, R(0)), R._lastCompilerOptimizationRoute)
R._lastCompilerOptimizationRoute = 'generic'
print(selected(prime_values, R(0), prime_values[129]), R._lastCompilerOptimizationRoute)

P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
cubic_values = tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(257))
K._lastCompilerOptimizationRoute = 'generic'
print(staged(cubic_values, K(0)), K._lastCompilerOptimizationRoute)
K._lastCompilerOptimizationRoute = 'generic'
print(selected(cubic_values, K(0), cubic_values[129]), K._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout
        .replaceAll("v8-number-residue-stream", "generic")
        .replaceAll("v8-extension-tuple-stream", "generic"),
      slow.stdout,
    );
    assert.equal(fast.stdout.match(/v8-number-residue-stream/g)?.length, 2);
    assert.equal(fast.stdout.match(/v8-extension-tuple-stream/g)?.length, 2);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("commuted products share values only after the commutative parent guard", async () => {
  const source = String.raw`
def symmetric(left_values, right_values, zero):
    left = zero
    right = zero + zero
    for x, y in zip(left_values, right_values):
        left = left+x*y
        right = right+y*x
    return left, right

def regrouped(values, zero, a, b):
    left = zero
    right = zero + zero
    for x in values:
        left = left+(x*a)*b
        right = right+x*(b*a)
    return left, right

R = Zmod(1009)
prime_left = tuple(R(index^2+3) for index in range(257))
prime_right = tuple(R(index^3+7) for index in range(257))
R._lastCompilerOptimizationRoute = 'generic'
print(symmetric(prime_left, prime_right, R(0)), R._lastCompilerOptimizationRoute)
R._lastCompilerOptimizationRoute = 'generic'
print(regrouped(prime_left, R(0), R(37), R(11)), R._lastCompilerOptimizationRoute)

P.<t> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=t^3+t+1)
aa = a*a
cubic_left = tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(257))
cubic_right = tuple(K(index+2)+((index^2+3)%5)*a+((index^3+1)%5)*aa for index in range(257))
K._lastCompilerOptimizationRoute = 'generic'
print(symmetric(cubic_left, cubic_right, K(0)), K._lastCompilerOptimizationRoute)
K._lastCompilerOptimizationRoute = 'generic'
print(regrouped(cubic_left, K(0), K(2)+a+aa, K(3)+4*a+2*aa), K._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout
        .replaceAll("v8-number-residue-stream", "generic")
        .replaceAll("v8-extension-tuple-stream", "generic"),
      slow.stdout,
    );
    assert.equal(fast.stdout.match(/v8-number-residue-stream/g)?.length, 2);
    assert.equal(fast.stdout.match(/v8-extension-tuple-stream/g)?.length, 2);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("guarded loop invariants agree with O0 across ring representations", async () => {
  const source = String.raw`
def scaled(values, zero, a, b):
    answer = zero
    for x in values:
        answer = answer+x*(a*b)
    return answer

def conditional(values, zero, a, b, pivot):
    answer = zero
    for x in values:
        if x == pivot:
            answer = answer+x*(a*b)
        else:
            answer = answer-x*(b*a)
    return answer

R = Zmod(1009)
prime_values = tuple(R(index^2+3) for index in range(257))
for function, arguments in (
    (scaled, (prime_values, R(0), R(37), R(11))),
    (conditional, (prime_values, R(0), R(37), R(11), prime_values[129])),
):
    R._lastCompilerOptimizationRoute = 'generic'
    print(function(*arguments), R._lastCompilerOptimizationRoute)

P.<t> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=t^3+t+1)
aa = a*a
cubic_values = tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(257))
factor_a = K(2)+a+aa
factor_b = K(3)+4*a+2*aa
for function, arguments in (
    (scaled, (cubic_values, K(0), factor_a, factor_b)),
    (conditional, (cubic_values, K(0), factor_a, factor_b, cubic_values[129])),
):
    K._lastCompilerOptimizationRoute = 'generic'
    print(function(*arguments), K._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout
        .replaceAll("v8-number-residue-stream", "generic")
        .replaceAll("v8-extension-tuple-stream", "generic"),
      slow.stdout,
    );
    assert.equal(fast.stdout.match(/v8-number-residue-stream/g)?.length, 2);
    assert.equal(fast.stdout.match(/v8-extension-tuple-stream/g)?.length, 2);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("dead-store lowering preserves results and guards eliminated operations", async () => {
  const source = String.raw`
def overwritten(values, zero):
    answer = zero
    scratch = zero
    for x in values:
        scratch = x*x
        scratch = x+x
        answer = answer+scratch
    return answer, scratch

def dead_branch(values, zero, pivot):
    answer = zero
    scratch = zero
    for x in values:
        if x == pivot:
            scratch = x*x
        else:
            scratch = x+x
        scratch = x
        answer = answer+scratch
    return answer, scratch

def dead_other(values, other, zero):
    answer = zero
    scratch = zero
    for x, y in zip(values, other):
        scratch = y*y
        scratch = x
        answer = answer+scratch
    return answer, scratch

R = Zmod(1009)
prime_values = tuple(R(index^2+3) for index in range(257))
R._lastCompilerOptimizationRoute = 'generic'
print(overwritten(prime_values, R(0)), R._lastCompilerOptimizationRoute)
R._lastCompilerOptimizationRoute = 'generic'
print(dead_branch(prime_values, R(0), prime_values[129]), R._lastCompilerOptimizationRoute)
S = Zmod(1013)
mixed_other = tuple(R(index+5) for index in range(256)) + (S(7),)
R._lastCompilerOptimizationRoute = 'late-dead-sequence-fallback'
print(dead_other(prime_values, mixed_other, R(0)), R._lastCompilerOptimizationRoute)

P.<t> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=t^3+t+1)
aa = a*a
cubic_values = tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(257))
K._lastCompilerOptimizationRoute = 'generic'
print(overwritten(cubic_values, K(0)), K._lastCompilerOptimizationRoute)
K._lastCompilerOptimizationRoute = 'generic'
print(dead_branch(cubic_values, K(0), cubic_values[129]), K._lastCompilerOptimizationRoute)
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout
        .replaceAll("v8-number-residue-stream", "generic")
        .replaceAll("v8-extension-tuple-stream", "generic"),
      slow.stdout,
    );
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }

  const guarded = await sessionAtLevel("O2");
  try {
    const result = await guarded.evaluate(String.raw`
import sagejs.runtime as runtime
def overwritten(values, zero):
    answer = zero
    scratch = zero
    for x in values:
        scratch = x*x
        scratch = x+x
        answer = answer+scratch
    return answer, scratch
P.<t> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=t^3+t+1)
values = tuple(K(index)+(index%5)*a for index in range(17))
prototype = runtime.object.getPrototypeOf(a)
calls = [0]
def changed_mul(other):
    calls[0] += 1
    return K(0)
runtime.reflect.set(prototype, '_mul_', changed_mul)
K._lastCompilerOptimizationRoute = 'eliminated-operation-fallback'
print(overwritten(values, K(0)), calls[0], K._lastCompilerOptimizationRoute)
`);
    assert.match(result.stdout, / 17 eliminated-operation-fallback\n$/);
  } finally {
    await guarded.close();
  }
});

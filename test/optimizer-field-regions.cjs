// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const createCompiler = require("../dist/tools/compiler.js").default;
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  verifyInternalRegionPlan,
} = require("../dist/tools/python/optimizer/verifier.js");

const fixture = JSON.parse(readFileSync(join(
  __dirname,
  "fixtures/optimizer-field-held-out.json",
), "utf8"));

const parserOptions = {
  filename: "<optimizer-field-region>",
  for_linting: true,
  import_dirs: [],
  exact_integer_literals: true,
  strict_python_scopes: true,
  scoped_flags: {
    dict_literals: true,
    overload_getitem: true,
    bound_methods: true,
    sequential_definitions: true,
  },
};

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

function corpusSource(prime, constant) {
  const programs = fixture.workloads.map((entry) =>
    `${entry.definition}\n${entry.call}`
  ).join("\n");
  return `
P.<x> = PolynomialRing(GF(${prime}))
K.<a> = GF(${prime}^2, modulus=x^2 + x + ${constant})
${programs}
`;
}

function generatedGrammarSource(prime, constant) {
  const functions = [];
  const calls = [];
  for (let index = 0; index < 12; index += 1) {
    const left = `state_${index}_left`;
    const right = `state_${index}_right`;
    const loop = `position_${index}`;
    const item = `coefficient_${index}`;
    const name = `generated_region_${index}`;
    const direct = index % 3 === 0;
    const iterable = direct ? item : `values[${loop}]`;
    const header = direct
      ? `    for ${item} in values:`
      : `    for ${loop} in range(count):`;
    const body = index % 2 === 0
      ? [
          `        ${left} = ${left} * ${right} + ${iterable}`,
          `        ${right} = -${right} + ${left}`,
        ]
      : [
          `        ${right} = ${right} * ${left} - ${iterable}`,
          `        ${left} = ${left} + ${right}`,
          `        if ${left} ${index % 4 === 1 ? "!=" : "=="} ${iterable}:`,
          `            ${right} = ${right} - ${left}`,
          "        else:",
          `            ${right} = ${right} + ${left}`,
        ];
    functions.push([
      `def ${name}(count, values, K, a):`,
      `    ${left} = K(${index + 1}) + ${(index % 7) + 1}*a`,
      `    ${right} = K(${index + 3}) + ${(index % 5) + 2}*a`,
      header,
      ...body,
      `    return ${left}, ${right}`,
    ].join("\n"));
    calls.push(`print(${name}(len(values), values, K, a))`);
  }
  return `
P.<x> = PolynomialRing(GF(${prime}))
K.<a> = GF(${prime}^2, modulus=x^2+x+${constant})
values = tuple(K(i^2+3) + (i^3+5)*a for i in range(11))
${functions.join("\n")}
${calls.join("\n")}
`;
}

test("ring-region IR is operation based and retains exact fallback provenance", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const source = corpusSource(97, 5);
    const ast = frontend.parse(source, parserOptions);
    const regions = ast.optimization_ir.regions.filter((region) =>
      region.passId === "math.closed-ring-region.v1"
    );
    assert.equal(regions.length, 4);
    assert.deepEqual(
      regions.map((region) => region.mathematical.kind),
      Array(4).fill("math.closed-commutative-ring-program"),
    );
    assert.ok(regions.every((region) => region.selected));
    assert.ok(regions.every((region) =>
      region.fallbackId.startsWith("semantic:<optimizer-field-region>:")
    ));
    const operations = new Set(regions.flatMap((region) =>
      region.mathematical.operations
    ));
    for (const operation of [
      "math.ring.add",
      "math.ring.sub",
      "math.ring.mul",
      "math.ring.equal",
    ]) assert.ok(operations.has(operation), operation);
    assert.ok(regions.some((region) => region.representation.materializations === 2));
  } finally {
    frontend.close();
  }
});

test("generated GF(p^2) programs agree exactly with O0 across reviewed bounds", async () => {
  for (const [prime, constant] of [[2, 1], [3, 2], [97, 5], [199999, 3]]) {
    const source = corpusSource(prime, constant);
    const optimized = await sessionAtLevel("O2");
    const generic = await sessionAtLevel("O0");
    try {
      const [fast, slow] = await Promise.all([
        optimized.evaluate(source),
        generic.evaluate(source),
      ]);
      assert.equal(fast.stdout, slow.stdout, `GF(${prime}^2)`);
      const route = await optimized.evaluate("K._lastCompilerOptimizationRoute");
      assert.equal(route.repr, "'v8-extension-tuple-stream'");
      const genericRoute = await generic.evaluate("K._lastCompilerOptimizationRoute");
      assert.equal(genericRoute.repr, "'generic'");
    } finally {
      await Promise.all([optimized.close(), generic.close()]);
    }
  }
});

test("deterministic grammar-generated regions agree with O0 across shapes", async () => {
  for (const [prime, constant] of [[2, 1], [3, 2], [97, 5], [199999, 3]]) {
    const source = generatedGrammarSource(prime, constant);
    const optimized = await sessionAtLevel("O2");
    const generic = await sessionAtLevel("O0");
    try {
      const [fast, slow] = await Promise.all([
        optimized.evaluate(source),
        generic.evaluate(source),
      ]);
      assert.equal(fast.stdout, slow.stdout, `generated GF(${prime}^2)`);
      const route = await optimized.evaluate("K._lastCompilerOptimizationRoute");
      assert.equal(route.repr, "'v8-extension-tuple-stream'");
    } finally {
      await Promise.all([optimized.close(), generic.close()]);
    }
  }
});

test("builtin zip tuple loops retain strictness, unpacking, and exact fallback", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  const source = String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^3, modulus=x^3+x+4)
def strict_dot(left, right):
    value = K(0)
    adjustment = K(3)+a
    for first, second in zip(left, right, strict=True):
        value = value + first*second
        if first != second:
            adjustment = adjustment + first-second
    return value, adjustment, first, second
def shortest_dot(left, right):
    value = K(0)
    for first, second in zip(left, right):
        value = value + first*second
    return value, first, second
left = tuple(K(i+1)+(i^2+2)*a for i in range(9))
right = tuple(K(i^2+3)+(2*i+1)*a for i in range(9))
short = tuple(right[i] for i in range(6))
print(strict_dot(left, right))
print(shortest_dot(left, short))
try:
    strict_dot(left, short)
except ValueError as error:
    print(type(error).__name__, str(error))
print(K._lastCompilerOptimizationRoute)
`;
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    const fastLines = fast.stdout.trim().split("\n");
    const slowLines = slow.stdout.trim().split("\n");
    assert.deepEqual(fastLines.slice(0, 3), slowLines.slice(0, 3));
    assert.match(fastLines[2], /zip\(\) argument 2 is shorter than argument 1/);
    assert.equal(fastLines[3], "v8-extension-tuple-stream");
    assert.equal(slowLines[3], "generic");
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("zip regions record explicit bindings and reject shadowed zip", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const accepted = frontend.parse(`
def dot(left, right, K):
    value = K(0)
    for first, second in zip(left, right, strict=True):
        value = value + first*second
    return value
`, parserOptions);
    const [region] = accepted.optimization_ir.regions.filter((candidate) =>
      candidate.passId === "math.closed-ring-region.v1"
    );
    assert.equal(region.selected, true);
    const plan = accepted.body[0].body[1].optimization_region.operands;
    assert.equal(plan.iteratorKind, "zip");
    assert.equal(plan.zipStrict, true);
    assert.deepEqual(plan.zipSequenceBindings, [0, 1]);
    assert.deepEqual(plan.zipTargets.map((target) => target.name), [
      "first", "second",
    ]);
    assert.throws(() => verifyInternalRegionPlan({
      ...accepted.body[0].body[1].optimization_region,
      operands: { ...plan, zipSequenceBindings: [0, 99] },
    }), /stale sequence bindings/);

    const shadowed = frontend.parse(`
def dot(zip, left, right, K):
    value = K(0)
    for first, second in zip(left, right, strict=True):
        value = value + first*second
    return value
`, parserOptions);
    assert.equal(shadowed.optimization_ir.regions.some((candidate) =>
      candidate.passId === "math.closed-ring-region.v1"
    ), false);

    const duplicateTarget = frontend.parse(`
def dot(left, right, K):
    value = K(0)
    for item, item in zip(left, right, strict=True):
        value = value + item
    return value
`, parserOptions);
    assert.equal(duplicateTarget.optimization_ir.regions.some((candidate) =>
      candidate.passId === "math.closed-ring-region.v1"
    ), false);
  } finally {
    frontend.close();
  }
});

test("augmented ring assignments agree with their exact generic dispatch", async () => {
  for (const setup of [
    `R=Zmod(1009)\nvalues=tuple(R(i^2+3) for i in range(257))\nparent=R`,
    `P.<x>=PolynomialRing(GF(5))\nK.<a>=GF(5^3,modulus=x^3+x+1)\nvalues=tuple(K(i)+(i^2+1)*a+(i^3+2)*a^2 for i in range(257))\nparent=K`,
  ]) {
    const source = `
${setup}
def augmented(values, parent):
    total=parent(1)
    product=parent(2)
    for coefficient in values:
        total += coefficient
        product *= coefficient
        total -= product
    return total,product
print(augmented(values,parent))
print(getattr(parent,'_lastCompilerOptimizationRoute','generic'))
`;
    const optimized = await sessionAtLevel("O2");
    const generic = await sessionAtLevel("O0");
    try {
      const [fast, slow] = await Promise.all([
        optimized.evaluate(source), generic.evaluate(source),
      ]);
      assert.equal(
        fast.stdout.split("\n")[0],
        slow.stdout.split("\n")[0],
      );
      assert.match(fast.stdout, /v8-(number-residue|extension-tuple)-stream/);
      assert.match(slow.stdout, /generic/);
    } finally {
      await Promise.all([optimized.close(), generic.close()]);
    }
  }
});

test("augmented plans are explicit, verified, and never select affine isolation", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
def augmented(values, K):
    total=K(1)
    product=K(2)
    for coefficient in values:
        total += coefficient
        product *= coefficient
        total -= product
    return total,product
`, parserOptions);
    const plan = ast.body[0].body[2].optimization_region;
    assert.deepEqual(plan.operands.inplaceOperations, ["add", "mul", "sub"]);
    assert.deepEqual(
      plan.operands.statements.map((statement) => statement.assignmentOperator),
      ["+=", "*=", "-="],
    );
    assert.equal(plan.operands.affine, null);
    assert.throws(() => verifyInternalRegionPlan({
      ...plan,
      operands: { ...plan.operands, inplaceOperations: ["add"] },
    }), /stale inplace operations/);
    assert.throws(() => verifyInternalRegionPlan({
      ...plan,
      operands: {
        ...plan.operands,
        statements: [{
          ...plan.operands.statements[0],
          assignmentOperator: "+=",
          value: { kind: "slot", slot: plan.operands.statements[0].target },
        }, ...plan.operands.statements.slice(1)],
      },
    }), /stale normalization/);
  } finally {
    frontend.close();
  }
});

test("callable in-place descriptors force the exact augmented fallback", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  const source = String.raw`
import sagejs.runtime as runtime
P.<x>=PolynomialRing(GF(97))
K.<a>=GF(97^2,modulus=x^2+x+5)
prototype=runtime.object.getPrototypeOf(a)
def changed_iadd(self,other):
    return K(17)+a
def changed_isub(self,other):
    return K(19)+2*a
def changed_imul(self,other):
    return K(23)+3*a
runtime.reflect.set(prototype,'__iadd__',changed_iadd)
runtime.reflect.set(prototype,'__isub__',changed_isub)
runtime.reflect.set(prototype,'__imul__',changed_imul)
def augmented(values):
    value=K(1)+a
    for coefficient in values:
        value += coefficient
        value *= coefficient
        value -= coefficient
    return value
values=tuple(K(i+2)+(i+1)*a for i in range(7))
K._lastCompilerOptimizationRoute='inplace-descriptor-fallback'
print(augmented(values),K._lastCompilerOptimizationRoute)
`;
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source), generic.evaluate(source),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    assert.match(fast.stdout, /inplace-descriptor-fallback/);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("prime fields consume the same operation graph and Number representation", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  const source = `
K = GF(65521)
def recurrence(count):
    left = K(1)
    right = K(3)
    increment = K(5)
    for step in range(count):
        left = left * right + increment
        right = right - left
    return left, right, step
print(recurrence(10000))
`;
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    const route = await optimized.evaluate("K._lastCompilerOptimizationRoute");
    assert.equal(route.repr, "'v8-number-residue-region'");
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("bounded static powers use one guarded ring operation graph across reviewed parents", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  const source = `
def power_sum(values, zero):
    answer = zero
    for index in range(len(values)):
        answer = answer + values[index]^0 + values[index]^1
        answer = answer + values[index]^2 - values[index]^3
        answer = answer + values[index]^4 - values[index]^7 + values[index]^8
    return answer

R = Zmod(100)
residues = tuple(R(index^2 + 3) for index in range(257))
print(power_sum(residues, R(0)), getattr(R, '_lastCompilerOptimizationRoute', 'generic'))

F = GF(101)
prime_values = tuple(F(index^2 + 3) for index in range(257))
print(power_sum(prime_values, F(0)), getattr(F, '_lastCompilerOptimizationRoute', 'generic'))

P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
extension_values = tuple(
    K(index) + ((index+1)%5)*a + ((index^2+2)%5)*aa
    for index in range(257)
)
print(power_sum(extension_values, K(0)), getattr(K, '_lastCompilerOptimizationRoute', 'generic'))
`;
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.deepEqual(
      fast.stdout.trim().split("\n").map((line) => line.split(" ")[0]),
      slow.stdout.trim().split("\n").map((line) => line.split(" ")[0]),
    );
    assert.deepEqual(
      fast.stdout.trim().split("\n").map((line) => line.split(" ").at(-1)),
      [
        "v8-number-residue-stream",
        "v8-number-residue-stream",
        "v8-extension-tuple-stream",
      ],
    );
    assert.ok(slow.stdout.trim().split("\n").every((line) =>
      line.endsWith(" generic")
    ));
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("static-power IR is explicit, bounded, and independently verified", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
def power_sum(values, zero):
    answer = zero
    for index in range(len(values)):
        answer = answer + values[index]^0 + values[index]^4 - values[index]^8
    return answer
`, parserOptions);
    const [region] = ast.optimization_ir.regions.filter((candidate) =>
      candidate.passId === "math.closed-ring-region.v1" && candidate.selected
    );
    assert.ok(region);
    assert.deepEqual(region.mathematical.operations.sort(), [
      "math.ring.add",
      "math.ring.pow",
      "math.ring.sub",
    ]);
    assert.ok(region.semantic.operations.includes("pow-dispatch"));
    assert.ok(region.cacheIdentityInputs.includes("operations:add,pow,sub"));
    assert.equal(region.target.selectedCandidate, "v8-closed-ring-program");
  } finally {
    frontend.close();
  }
});

test("ordinary extension powers retain the optimizer's fixed-shape shadow", async () => {
  const session = await sessionAtLevel("O0");
  try {
    const result = await session.evaluate(`
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
values = tuple([a^0, a^2, a^3, (a+1)^19])
print(tuple(tuple(value._machineCoordinates) for value in values))
print(tuple(
    value == K._from_machine_coordinates(value._machineCoordinates)
    for value in values
))
`);
    assert.equal(result.stdout, [
      "((1, 0, 0), (0, 0, 1), (4, 4, 0), (4, 3, 3))",
      "(True, True, True, True)",
      "",
    ].join("\n"));
  } finally {
    await session.close();
  }
});

test("public polynomial evaluation composes the same extension-tuple region", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  const source = `
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
R.<t> = PolynomialRing(K)
coefficients = [K(index^2 + 3) + (index^3 + 5)*a for index in range(80)]
polynomial = R(coefficients)
point = K(17)+23*a
print(polynomial(point))
`;
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    const route = await optimized.evaluate("K._lastCompilerOptimizationRoute");
    assert.equal(route.repr, "'v8-extension-tuple-stream'");
    const parent = await optimized.evaluate("polynomial(point).parent() is K");
    assert.equal(parent.repr, "True");
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("elliptic-curve batch validation is a held-out compiler consumer", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  const source = `
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
E = EllipticCurve(K, [0,0,0,1,1])
Q = E(0,1)
negative_Q = E(0,-1)
xs = tuple(K(0) for index in range(257))
ys = tuple(K(1) if index % 2 == 0 else -K(1) for index in range(257))
a4 = E.a4()
a6 = E.a6()
weight = K(7)+a
def validate_curve_batch(xs, ys, a4, a6, weight):
    checksum = K(0)
    for index in range(len(xs)):
        checksum = checksum*weight + ys[index]*ys[index] - (xs[index]*xs[index]*xs[index] + a4*xs[index] + a6)
    return checksum
answer = validate_curve_batch(xs, ys, a4, a6, weight)
route = K._lastCompilerOptimizationRoute
print(Q, negative_Q, len(xs), answer, route)
`;
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(
      fast.stdout,
      "(0 : 1 : 1) (0 : 96 : 1) 257 0 v8-extension-tuple-stream\n",
    );
    assert.equal(
      slow.stdout,
      "(0 : 1 : 1) (0 : 96 : 1) 257 0 generic\n",
    );
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("optimized polynomial evaluation allocates only materialized exits", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
R.<t> = PolynomialRing(K)
polynomial = R([K(index^2+3)+(index^3+5)*a for index in range(128)])
point = K(17)+23*a
before = len(K._nativeResourceChildren)
for repetition in range(64):
    value = polynomial(point)
after = len(K._nativeResourceChildren)
print(value.parent() is K, K._lastCompilerOptimizationRoute, after-before)
`);
    const match = result.stdout.trim().match(
      /^True v8-extension-tuple-stream (\d+)$/,
    );
    assert.ok(match, result.stdout);
    assert.ok(Number(match[1]) <= 66, result.stdout);
  } finally {
    await session.close();
  }
});

test("zero trips preserve identity and invalid inputs execute the untouched loop", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
def zero_trip(count):
    value = K(1)+a
    original = value
    marker = 177
    multiplier = K(2)+a
    increment = K(3)+2*a
    for marker in range(count):
        value = value*multiplier+increment
    return value is original, marker
print(zero_trip(0))
def zero_trip_body_names(count):
    value = K(1)
    for marker in range(count):
        value = value*body_only_multiplier+body_only_increment
    return value
print(zero_trip_body_names(0))
try:
    zero_trip(1.5)
except TypeError as error:
    print(isinstance(error, TypeError), 'integer' in str(error))

def horner(values):
    value = K(1)
    point = K(2)+a
    for coefficient in values:
        value = value*point+coefficient
    return value
K._lastCompilerOptimizationRoute = 'fallback-sentinel'
print(horner([K(2), K(3)+a]), K._lastCompilerOptimizationRoute)
`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "(True, 177)",
      "1",
      "True True",
      "6*a + 6 fallback-sentinel",
    ]);
  } finally {
    await session.close();
  }
});

test("method, parent, sequence, and range guards fail closed", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
def pair(count):
    left = K(1)+a
    right = K(2)+3*a
    for step in range(count):
        left = left*right+right
        right = right-left
    return left, right
saved = K._machineExtensionSub
K._machineExtensionSub = None
K._lastCompilerOptimizationRoute = 'method-guard'
print(pair(5), K._lastCompilerOptimizationRoute)
K._machineExtensionSub = saved

Q.<y> = PolynomialRing(GF(200003))
L.<b> = GF(200003^2, modulus=y^2+y+1)
def outside(count):
    left = L(1)+b
    right = L(2)+3*b
    for step in range(count):
        left = left*right+right
        right = right-left
    return left
L._lastCompilerOptimizationRoute = 'bound-guard'
print(outside(3), L._lastCompilerOptimizationRoute)
`);
    assert.match(result.stdout, /method-guard/);
    assert.match(result.stdout, /bound-guard/);
  } finally {
    await session.close();
  }
});

test("a changed inherited unary descriptor rejects the optimized region", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
import sagejs.runtime as runtime
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
prototype = runtime.object.getPrototypeOf(a)
def changed_negation(_self):
    return K(42)
runtime.reflect.set(prototype, '__neg__', changed_negation)
def negate(values):
    value = K(1)+a
    for coefficient in values:
        value = -value + coefficient
    return value
K._lastCompilerOptimizationRoute = 'descriptor-fallback'
print(negate(tuple([K(2),K(3)])), K._lastCompilerOptimizationRoute)
`);
    assert.equal(result.stdout, "45 descriptor-fallback\n");
  } finally {
    await session.close();
  }
});

test("a changed inherited power descriptor rejects the optimized region", async () => {
  const session = await sessionAtLevel("O2");
  try {
    const result = await session.evaluate(String.raw`
import sagejs.runtime as runtime
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
prototype = runtime.object.getPrototypeOf(a)
def changed_power(_self, _exponent):
    return K(42)
runtime.reflect.set(prototype, '__pow__', changed_power)
def power_sum(values):
    value = K(0)
    for coefficient in values:
        value = value + coefficient^2
    return value
K._lastCompilerOptimizationRoute = 'power-descriptor-fallback'
print(power_sum(tuple([K(2),K(3)])), K._lastCompilerOptimizationRoute)
`);
    assert.equal(result.stdout, "84 power-descriptor-fallback\n");
  } finally {
    await session.close();
  }
});

test("proxy elements are rejected before guard property access", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  const source = String.raw`
import sagejs.runtime as runtime
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
events = []
def get_trap(target, name, receiver):
    events.append(str(name))
    return runtime.reflect.get(target, name, receiver)
handler = runtime.object.create(None)
runtime.reflect.set(handler, 'get', get_trap)
proxy = runtime.reflect.construct(
    runtime.proxy_class,
    [K(3)+a, handler],
)
def guarded(values):
    left = K(1)+2*a
    right = K(7)+a
    pivot = K(11)+3*a
    for coefficient in values:
        if coefficient == pivot:
            left = left + right
            right = right - coefficient
        else:
            left = left*right+coefficient
            right = right+left
    return left, right
K._lastCompilerOptimizationRoute = 'proxy-fallback'
print(guarded(runtime.math_tuple([K(2)+a, proxy])))
print(events)
print(K._lastCompilerOptimizationRoute)
`;
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    assert.match(fast.stdout, /proxy-fallback/);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("unsupported effects, aliases, callbacks, and source shapes are rejected", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const rejected = [
      "for i in range(n):\n    x = x*y+z\n    sink.append(x)\n",
      "for i in range(n):\n    x.value = x*y\n",
      "for i in range(n):\n    x = callback(x)\n",
      "for i in custom():\n    x = x*y+z\n",
      "for i in range(n):\n    x = x/y\n",
      "for i in range(n):\n    x = x**9\n",
      "for i in range(n):\n    x = x**exponent\n",
      `for i in range(n):\n${Array(65).fill("    x = x*y").join("\n")}\n`,
    ];
    for (const source of rejected) {
      const ast = frontend.parse(source, parserOptions);
      assert.equal(
        ast.optimization_ir.regions.some((region) =>
          region.passId === "math.closed-ring-region.v1" && region.selected
        ),
        false,
        source,
      );
    }

    const catchable = frontend.parse(`
try:
    for i in range(n):
        x = x*y+z
except KeyboardInterrupt:
    interrupted = True
`, parserOptions);
    const [catchableRegion] = catchable.optimization_ir.regions;
    assert.equal(catchableRegion.selected, false);
    assert.deepEqual(catchableRegion.rejectionReasons, [
      "catchable-interrupt-region",
    ]);
  } finally {
    frontend.close();
  }
});

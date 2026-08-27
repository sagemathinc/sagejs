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
          `        if ${left} == ${iterable}:`,
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

test("field-region IR is operation based and retains exact fallback provenance", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const source = corpusSource(97, 5);
    const ast = frontend.parse(source, parserOptions);
    const regions = ast.optimization_ir.regions.filter((region) =>
      region.passId === "math.closed-field-region.v1"
    );
    assert.equal(regions.length, 4);
    assert.deepEqual(
      regions.map((region) => region.mathematical.kind),
      Array(4).fill("math.closed-field-program"),
    );
    assert.ok(regions.every((region) => region.selected));
    assert.ok(regions.every((region) =>
      region.fallbackId.startsWith("semantic:<optimizer-field-region>:")
    ));
    const operations = new Set(regions.flatMap((region) =>
      region.mathematical.operations
    ));
    for (const operation of [
      "math.field.add",
      "math.field.sub",
      "math.field.mul",
      "math.field.equal",
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
      assert.equal(route.repr, "'v8-extension-tuple-region'");
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
      assert.equal(route.repr, "'v8-extension-tuple-region'");
    } finally {
      await Promise.all([optimized.close(), generic.close()]);
    }
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
      "(0 : 1 : 1) (0 : 96 : 1) 257 0 v8-extension-tuple-region\n",
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
    value = K(1)+2*a
    point = K(7)+a
    for coefficient in values:
        value = value*point+coefficient
    return value
K._lastCompilerOptimizationRoute = 'proxy-fallback'
print(guarded(runtime.math_tuple([proxy])))
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
      "for i in range(n):\n    x = x**2\n",
    ];
    for (const source of rejected) {
      const ast = frontend.parse(source, parserOptions);
      assert.equal(
        ast.optimization_ir.regions.some((region) =>
          region.passId === "math.closed-field-region.v1" && region.selected
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

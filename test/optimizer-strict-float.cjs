// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const createCompiler = require("../dist/tools/compiler.js").default;
const { createSage } = require("../dist/tools/kernel.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  STRICT_FLOAT_REGION_PASS,
  verifyInternalRegionPlan,
} = require("../dist/tools/python/optimizer/index.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const parserOptions = {
  filename: "<optimizer-strict-float>",
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

const definition = `
def ordered(n: int, x: float, a: float, b: float) -> float:
    for index in range(n):
        x = x*a + b
    return x
`;

const differentialSource = `${definition}
from array import array

def coupled(n: int, left: float, right: float, pivot: float):
    for index in range(n):
        product = left*right
        if product == pivot:
            left = product-right
        else:
            left = product+right
        right = right-left
    return left, right

def bits(value):
    return array('d', [value]).tobytes().hex()

values = [
    ordered(9, float(0.5), float(0.75), float(0.125)),
    ordered(1, -0.0, 1.0, -0.0),
    ordered(1, float('inf'), 0.0, 1.0),
    ordered(2, 1e308, 2.0, -1e308),
    ordered(4, 5e-324, 0.5, 5e-324),
]
print([(bits(value), type(value) is float) for value in values])
pair = coupled(9, 0.123456789, 0.987654321, 0.25)
print(tuple(bits(value) for value in pair))
identity = float(1)
print(ordered(0, identity, float(2), float(3)) is identity)
fallback = ordered(3, 1, 2, 3)
print(fallback, type(fallback) is int)
`;

async function sessionAtLevel(level) {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = level;
  try {
    return await createSage({ mode: "python" });
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

function runCPython(source) {
  const result = spawnSync(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.replaceAll("\r\n", "\n");
}

function loops(compiler, root) {
  const answer = [];
  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    if (value instanceof compiler.AST_ForIn) answer.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (["start", "end", "scope", "thedef"].includes(key)) continue;
      if (typeof child !== "function") visit(child);
    }
  };
  visit(root);
  return answer;
}

test("strict float regions have a separate ordered IEEE-754 contract", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(definition, parserOptions);
    const [region] = ast.optimization_ir.regions;
    assert.equal(region.passId, STRICT_FLOAT_REGION_PASS);
    assert.equal(region.selected, true);
    assert.equal(region.semantic.kind, "python.strict-floating-loop");
    assert.equal(region.mathematical.kind, "math.ordered-binary64-program");
    assert.match(region.mathematical.exactness, /no reassociation/);
    assert.doesNotMatch(JSON.stringify(region), /commutative-ring/);
    const [loop] = loops(compiler, ast);
    assert.equal(loop.optimization_region.kind, "strict-float-region");
    assert.deepEqual(
      loop.optimization_region.operands.annotatedFloatArguments.map(
        (witness) => witness.argument.name,
      ),
      ["x", "a", "b"],
    );
    assert.doesNotThrow(() => verifyInternalRegionPlan(loop.optimization_region));
    assert.throws(
      () => verifyInternalRegionPlan({
        ...loop.optimization_region,
        operands: {
          ...loop.optimization_region.operands,
          annotatedFloatArguments:
            loop.optimization_region.operands.annotatedFloatArguments.slice(1),
        },
      }),
      /stale annotations/,
    );
  } finally {
    frontend.close();
  }
});

test("annotations are hints and unsupported numerical semantics stay generic", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    for (const source of [
      definition.replace("x: float", "x: int"),
      definition.replace("x = x*a + b", "x = x/a + b"),
      definition.replace("x = x*a + b", "x = x*a + 1.0"),
    ]) {
      const ast = frontend.parse(source, parserOptions);
      assert.equal(
        ast.optimization_ir.regions.some(
          (region) => region.passId === STRICT_FLOAT_REGION_PASS,
        ),
        false,
      );
    }
  } finally {
    frontend.close();
  }
});

test("O2 preserves O0 and CPython binary64 bits and runtime type fallback", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(differentialSource),
      generic.evaluate(differentialSource),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    assert.equal(fast.stdout, runCPython(differentialSource));
    assert.match(fast.stdout, /0000000000000080/);
    assert.match(fast.stdout, /000000000000f8ff/);
    assert.match(fast.stdout, /True\n29 True\n$/);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("mutated numeric intrinsics reject the primitive lowering", async () => {
  const source = `${definition}
import sagejs.runtime as runtime
prototype = runtime.number.prototype
original = runtime.reflect.get(prototype, 'valueOf')
calls = []
def replacement(*args):
    calls.append(1)
    return 2.5
runtime.reflect.set(prototype, 'valueOf', replacement)
answer = ordered(1, float(1), float(2), float(3))
runtime.reflect.set(prototype, 'valueOf', original)
print(answer, len(calls))
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(source),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    assert.equal(fast.stdout, "8.75 3\n");
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

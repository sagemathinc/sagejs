// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const createCompiler = require("../dist/tools/compiler.js").default;
const { createSage } = require("../dist/tools/kernel.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  optimizerCatalog,
  verifyOptimizationDecision,
} = require("../dist/tools/python/optimizer/index.js");
const {
  STRICT_FLOAT_ARRAY_DOMAIN,
  STRICT_FLOAT_ARRAY_INTERNAL_KIND,
  STRICT_FLOAT_ARRAY_LOWERING,
  STRICT_FLOAT_ARRAY_PASS,
  STRICT_FLOAT_ARRAY_VERIFIER,
} = require(
  "../dist/tools/python/optimizer/domains/strict-binary64-array/index.js"
);
const {
  strictFloatArrayPlugin,
  strictFloatArrayRegionPass,
} = require(
  "../dist/tools/python/optimizer/passes/strict-float-array-region.js"
);
const {
  verifyStrictFloatArrayPlan,
} = require(
  "../dist/tools/python/optimizer/verifiers/strict-float-array.js"
);
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const integrated = optimizerCatalog.plugins.some(
  (plugin) => plugin.id === STRICT_FLOAT_ARRAY_PASS,
);

const parserOptions = {
  filename: "<optimizer-strict-float-array>",
  for_linting: true,
  import_dirs: [],
  optimization_level: "O0",
  exact_integer_literals: true,
  strict_python_scopes: true,
  scoped_flags: {
    dict_literals: true,
    overload_getitem: true,
    bound_methods: true,
    sequential_definitions: true,
  },
};

const reductionDefinition = `
def ordered(values: tuple[float, ...], total: float, scale: float) -> float:
    for value in values:
        total = total*scale + value
    return total
`;

function walk(compiler, rootNode, visitor) {
  const ignored = new Set([
    "start", "end", "scope", "thedef", "imports", "globals", "classes",
    "baselib", "optimization_ir", "optimization_region",
    "optimization_contract",
  ]);
  const seen = new Set();
  const visit = (value, ancestors = []) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, ancestors));
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    visitor(value, ancestors);
    for (const [key, child] of Object.entries(value)) {
      if (!ignored.has(key) && typeof child !== "function") {
        visit(child, [...ancestors, value]);
      }
    }
  };
  visit(rootNode);
}

async function isolatedCandidates(source, { contract = true } = {}) {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(source, parserOptions);
    if (contract) {
      const definition = ast.body.find(
        (node) => node instanceof compiler.AST_Function,
      );
      definition.optimization_contract = {
        requiredPassId: STRICT_FLOAT_ARRAY_PASS,
      };
    }
    const candidates = [];
    strictFloatArrayRegionPass.run(ast, {
      compiler,
      controls: {
        level: "O2",
        disabledPasses: new Set(),
        requiredOptimizations: new Set(),
        explain: false,
      },
      walk(rootNode, visitor) {
        walk(compiler, rootNode, visitor);
      },
      consider(candidate) {
        candidates.push(candidate);
      },
    });
    return candidates;
  } finally {
    frontend.close();
  }
}

function changedPlan(plan, operands) {
  return { ...plan, operands: { ...plan.operands, ...operands } };
}

test("strict binary64 array plugin exports frozen stable contracts", () => {
  assert.equal(strictFloatArrayPlugin.id, STRICT_FLOAT_ARRAY_PASS);
  assert.equal(strictFloatArrayPlugin.domainId, STRICT_FLOAT_ARRAY_DOMAIN);
  assert.equal(strictFloatArrayPlugin.priority, 250);
  assert.equal(strictFloatArrayPlugin.claimSemantics, "exclusive");
  assert.deepEqual(strictFloatArrayPlugin.loweringIds, [STRICT_FLOAT_ARRAY_LOWERING]);
  assert.equal(strictFloatArrayRegionPass.verifier, STRICT_FLOAT_ARRAY_VERIFIER);
  assert(Object.isFrozen(strictFloatArrayPlugin));
});

test("the plan verifier is independent of transformation-side claims", () => {
  const source = readFileSync(
    join(root, "tools/python/optimizer/verifiers/strict-float-array.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /from ["'][^"']*(?:canonicalize|domains|passes|representations|targets)\//,
  );
  assert.match(source, /const VERIFIED_PASS = "math\.strict-float-array-region\.v1"/);
  assert.match(source, /const VERIFIED_CODE_SIZE_BUDGET = 16_384/);
});

test("the isolated pass recognizes only explicit immutable-tuple reductions", async () => {
  const [candidate] = await isolatedCandidates(reductionDefinition);
  assert(candidate);
  assert.equal(candidate.internal.kind, STRICT_FLOAT_ARRAY_INTERNAL_KIND);
  assert.equal(candidate.internal.loweringId, STRICT_FLOAT_ARRAY_LOWERING);
  assert.equal(candidate.decision.mathematical.kind,
    "math.ordered-binary64-sequence-program");
  assert.equal(candidate.decision.target.copiedBytes, 0);
  assert.equal(candidate.decision.target.boundaryCrossings, 0);
  assert.equal(candidate.decision.target.candidates[0].cost.cleanupOperations, 0);
  assert.match(candidate.decision.mathematical.exactness, /no reassociation/);
  assert.doesNotThrow(() => verifyStrictFloatArrayPlan(candidate.internal));
  assert.doesNotThrow(() => verifyOptimizationDecision({
    ...candidate.decision,
    functionId: "function:isolated-test",
    selected: true,
    rejectionReasons: [],
  }));

  const [reverse] = await isolatedCandidates(
    reductionDefinition.replace("in values", "in reversed(values)"),
  );
  assert.equal(reverse.internal.operands.iterationOrder, "reverse");
  assert.doesNotThrow(() => verifyStrictFloatArrayPlan(reverse.internal));

  for (const [source, contract = true] of [
    [reductionDefinition, false],
    [reductionDefinition.replace("tuple[float, ...]", "list[float]")],
    [reductionDefinition.replace("total: float", "total: int")],
    [reductionDefinition.replace("total*scale + value", "total/scale + value")],
    [reductionDefinition.replace("total = total*scale + value",
      "total += value")],
    [reductionDefinition.replace("total*scale + value", "total*scale + 1")],
  ]) {
    assert.deepEqual(await isolatedCandidates(source, { contract }), []);
  }

  const [catchable] = await isolatedCandidates(`
def caught(values: tuple[float, ...], total: float):
    try:
        for value in values:
            total = total + value
    except KeyboardInterrupt:
        pass
    return total
`);
  assert.deepEqual(catchable.staticRejectionReasons, [
    "catchable-interrupt-region",
  ]);
});

test("the independent verifier rejects mutated safety claims and graphs", async () => {
  const [candidate] = await isolatedCandidates(`
def coupled(values: tuple[float, ...], left: float, right: float, pivot: float):
    for value in values:
        product = left*value
        if product != pivot:
            left = product-right
        else:
            left = product+right
        right = right-left
    return left, right
`);
  const plan = candidate.internal;
  assert.doesNotThrow(() => verifyStrictFloatArrayPlan(plan));
  assert.throws(
    () => verifyStrictFloatArrayPlan(changedPlan(plan, {
      operations: [...plan.operands.operations].reverse(),
    })),
    /stale operations/,
  );
  assert.throws(
    () => verifyStrictFloatArrayPlan(changedPlan(plan, {
      sequenceStrategy: "pack",
    })),
    /representation facts/,
  );
  assert.throws(
    () => verifyStrictFloatArrayPlan(changedPlan(plan, {
      targetCodeBytes: plan.operands.targetCodeBytes + 1,
    })),
    /target facts/,
  );
  assert.throws(
    () => verifyStrictFloatArrayPlan(changedPlan(plan, {
      annotatedFloatArguments: plan.operands.annotatedFloatArguments.slice(1),
    })),
    /scalar annotations/,
  );
  const mutatedStatements = plan.operands.statements.map((statement, index) =>
    index === 0 ? { ...statement, target: plan.operands.slots.length } : statement
  );
  assert.throws(
    () => verifyStrictFloatArrayPlan(changedPlan(plan, {
      statements: mutatedStatements,
    })),
    /assignment is invalid/,
  );
});

test("the isolated emitter visibly enforces transactional source order", () => {
  const source = readFileSync(
    join(root, "src/output/optimizer/strict_float_array.py"),
    "utf8",
  );
  assert.match(source, /Object\.getOwnPropertyDescriptor/);
  assert.match(source, /ρσ_strict_float_unbox/);
  assert.match(source, /sequence-element-not-binary64/);
  assert.match(source, /_print_closed_field_fallback/);
  assert.match(source, /\.materialize\(/);
  assert.doesNotMatch(source, /Math\.fround|\.reduce\(|fast.?math|sort\(/i);
});

const differentialSource = `
from sagejs.compiler import optimize
from array import array

@optimize(require="${STRICT_FLOAT_ARRAY_PASS}", target="v8")
${reductionDefinition.trim()}

@optimize(require="${STRICT_FLOAT_ARRAY_PASS}", target="v8")
def reverse(values: tuple[float, ...], total: float, scale: float):
    for value in reversed(values):
        total = total*scale + value
    return total, value

def bits(value):
    return array('d', [value]).tobytes().hex()

cases = [
    ((1e16, -1e16, 1.0), 0.0, 1.0),
    ((-0.0,), -0.0, 1.0),
    ((float('inf'),), 0.0, 0.0),
    ((5e-324, 5e-324, -5e-324), 5e-324, 0.5),
    ((float('nan'), 1.0), 2.0, 3.0),
]
print([(bits(ordered(values, total, scale)), type(ordered(values, total, scale)) is float)
       for values, total, scale in cases])
identity = float(1)
print(ordered((), identity, float(2)) is identity)
print(bits(ordered([float(1), float(2)], float(0), float(1))))
fallback = ordered((float(1), 2, float(3)), float(0), float(1))
print(bits(fallback), type(fallback) is float)
try:
    ordered((float(1), 'bad', float(3)), float(0), float(1))
except Exception as error:
    print(type(error).__name__)
first = float(1)
answer, final = reverse((first, float(2), float(3)), float(0), float(1))
print(bits(answer), final is first)
`;

function cpythonSource(source) {
  return source
    .replace(`from sagejs.compiler import optimize\n`, "")
    .replaceAll(
      `@optimize(require="${STRICT_FLOAT_ARRAY_PASS}", target="v8")\n`,
      "",
    );
}

function runCPython(source) {
  const result = spawnSync(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: cpythonSource(source),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.replaceAll("\r\n", "\n");
}

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

test("integrated O2 matches O0 and CPython exact binary64 bits", {
  skip: integrated ? false : "awaiting integration-owned catalogs and dispatcher",
}, async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(differentialSource),
      generic.evaluate(cpythonSource(differentialSource)),
    ]);
    assert.equal(fast.stdout, slow.stdout);
    assert.equal(fast.stdout, runCPython(differentialSource));
    assert.match(fast.stdout, /0000000000000080/);
    assert.match(fast.stdout, /000000000000f87f/);
    assert.match(
      fast.stdout,
      /True\n0000000000000840\n0000000000001840 True\nTypeError\n/,
    );
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

test("integrated target code retains one ordered operation per source node", {
  skip: integrated ? false : "awaiting integration-owned catalogs and dispatcher",
}, async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(differentialSource, {
      ...parserOptions,
      optimization_level: "O2",
    });
    const output = new compiler.OutputStream({
      beautify: true,
      python: true,
      python_tuples: true,
    });
    ast.print(output);
    const javascript = output.toString();
    assert.match(javascript, /ρσ_FloatArrayElement/);
    assert.match(javascript, /Object\.getOwnPropertyDescriptor/);
    assert.match(javascript, /sequence-element-not-binary64/);
    assert.doesNotMatch(javascript, /Math\.fround|\.reduce\(/);
  } finally {
    frontend.close();
  }
});

test("integrated numeric-intrinsic mutation takes the exact fallback", {
  skip: integrated ? false : "awaiting integration-owned catalogs and dispatcher",
}, async () => {
  const source = `${differentialSource.split("cases =")[0]}
import sagejs.runtime as runtime
prototype = runtime.number.prototype
original = runtime.reflect.get(prototype, 'valueOf')
calls = []
def replacement(*args):
    calls.append(1)
    return 2.5
runtime.reflect.set(prototype, 'valueOf', replacement)
answer = ordered((float(1), float(2)), float(0), float(1))
runtime.reflect.set(prototype, 'valueOf', original)
print(answer, len(calls))
`;
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [fast, slow] = await Promise.all([
      optimized.evaluate(source),
      generic.evaluate(cpythonSource(source)),
    ]);
    assert.equal(fast.stdout, slow.stdout);
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});

// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  CLOSED_RING_REGION_PASS,
  formatOptimizationExplanation,
  STRICT_FLOAT_REGION_PASS,
} = require("../dist/tools/python/optimizer/index.js");

const contractSource = `
from sagejs.compiler import optimize

@optimize(
    require="math.strict-float-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="error",
)
def recurrence(count: int, value: float, multiplier: float) -> float:
    for _index in range(count):
        value = value * multiplier
    return value
`;

function options(extra = {}) {
  return {
    filename: "optimizer-contract.py",
    for_linting: true,
    libdir: path.join(__dirname, "../src/lib"),
    import_dirs: [],
    exact_integer_literals: true,
    strict_python_scopes: true,
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
    ...extra,
  };
}

function findLoop(compiler, root) {
  let answer = null;
  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value) || answer) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    if (value instanceof compiler.AST_ForIn) {
      answer = value;
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (["start", "end", "scope", "thedef", "imports", "globals"].includes(key)) {
        continue;
      }
      if (typeof child !== "function") visit(child);
    }
  };
  visit(root);
  return answer;
}

test("an import-proven @optimize contract covers its function and runtime guard", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(contractSource, options());
    assert.equal(ast.optimization_ir.contracts.length, 1);
    const [contract] = ast.optimization_ir.contracts;
    assert.equal(contract.functionName, "recurrence");
    assert.equal(contract.requiredPassId, STRICT_FLOAT_REGION_PASS);
    assert.equal(contract.status, "satisfied");
    assert.equal(contract.loopCount, 1);
    assert.equal(contract.matchedRegionIds.length, 1);
    const [region] = ast.optimization_ir.regions.filter(
      (candidate) => candidate.functionId === contract.id,
    );
    assert.equal(region.id, contract.matchedRegionIds[0]);
    assert.equal(region.target.kind, "v8");
    const loop = findLoop(compiler, ast);
    assert.equal(loop.optimization_region.functionId, contract.id);
    assert.equal(loop.optimization_region.guardFailure, "error");
    assert.match(
      formatOptimizationExplanation(ast.optimization_ir),
      /contract recurrence \[satisfied\].*coverage=all-loops.*guard-failure=error/,
    );
  } finally {
    frontend.close();
  }
});

test("contracts fail compilation for missing coverage, pass, level, or target", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    assert.throws(
      () => frontend.parse(
        contractSource.replace(
          "        value = value * multiplier",
          "        value = value * multiplier + 1.0",
        ),
        options(),
      ),
      /optimization contract for recurrence was not satisfied.*no optimizer candidate/,
    );
    assert.throws(
      () => frontend.parse(contractSource, options({ optimization_level: "O0" })),
      /optimization contract for recurrence was not satisfied.*optimization-level-too-low/,
    );
    assert.throws(
      () => frontend.parse(
        contractSource.replace('target="v8"', 'target="native"'),
        options(),
      ),
      /optimization contract for recurrence was not satisfied.*selected target v8/,
    );
  } finally {
    frontend.close();
  }
});

test("all-loops is stronger than at-least-one", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const twoLoops = contractSource.replace(
    "    return value",
    `    for _index in range(count):
        print(value)
    return value`,
  );
  try {
    assert.throws(
      () => frontend.parse(twoLoops, options()),
      /coverage=all-loops.*no optimizer candidate/,
    );
    const ast = frontend.parse(
      twoLoops.replace('coverage="all-loops"', 'coverage="at-least-one"'),
      options(),
    );
    assert.equal(ast.optimization_ir.contracts[0].status, "satisfied");
    assert.equal(ast.optimization_ir.contracts[0].loopCount, 2);
    assert.equal(ast.optimization_ir.contracts[0].matchedRegionIds.length, 1);
  } finally {
    frontend.close();
  }
});

test("an exact contract reserves ambiguous loops for its named domain", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const source = contractSource.replace(
      "math.strict-float-region.v1",
      "math.closed-ring-region.v1",
    );
    const ast = frontend.parse(source, options());
    assert.equal(ast.optimization_ir.contracts[0].status, "satisfied");
    const [region] = ast.optimization_ir.regions;
    assert.equal(region.passId, CLOSED_RING_REGION_PASS);
    assert.equal(region.selected, true);
    assert.equal(
      ast.optimization_ir.regions.some(
        (candidate) => candidate.passId === STRICT_FLOAT_REGION_PASS,
      ),
      false,
    );
  } finally {
    frontend.close();
  }
});

test("contract recognition is tied to exact import provenance and literal syntax", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ordinary = frontend.parse(`
def optimize(**_options):
    return lambda function: function

@optimize(require="math.strict-float-region.v1")
def f(count: int, value: float):
    for _index in range(count):
        value = value + value
    return value
`, options());
    assert.deepEqual(ordinary.optimization_ir.contracts, []);
    assert.throws(
      () => frontend.parse(
        contractSource.replace('target="v8",', 'target=chosen_target,'),
        options(),
      ),
      /accepts keyword string literals only/,
    );
    assert.throws(
      () => frontend.parse(
        contractSource.replace('    target="v8",\n', '    target="v8",\n    surprise="yes",\n'),
        options(),
      ),
      /unknown option surprise/,
    );
  } finally {
    frontend.close();
  }
});

test("the runtime decorator preserves the callable under CPython", () => {
  const compilerModulePath = path.join(__dirname, "../src/lib");
  const python = spawnSync("/usr/bin/python3", ["-c", `
import sys
sys.path.insert(0, ${JSON.stringify(compilerModulePath)})
from sagejs.compiler import optimize, optimization_contract

@optimize(require="math.strict-float-region.v1", guard_failure="error")
def f(value):
    return value + 1

assert f(4) == 5
assert optimization_contract(f) == {
    "require": "math.strict-float-region.v1",
    "coverage": "all-loops",
    "target": "auto",
    "guard_failure": "error",
}
`], {
    cwd: path.join(__dirname, ".."),
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(python.status, 0, python.stderr || python.stdout);
});

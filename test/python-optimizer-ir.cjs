// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  CLOSED_AFFINE_RECURRENCE_PASS,
  OPTIMIZER_IR_SCHEMA,
  explainOptimizationProgram,
  formatOptimizationExplanation,
  verifyOptimizationDecision,
  verifyOptimizationProgram,
} = require("../dist/tools/python/optimizer/index.js");

const source = `
def recurrence(n, field):
    value = field(1)
    multiplier = field(12345)
    increment = field(6789)
    for index in range(n):
        value = value * multiplier + increment
    return value
`;

function optimizerOptions(extra = {}) {
  return {
    filename: "optimizer-witness.sage",
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
    ...extra,
  };
}

function findLoop(compiler, root) {
  const seen = new Set();
  let answer;
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

test("the mathematical optimizer emits versioned verified IR", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(source, optimizerOptions());
    const program = ast.optimization_ir;
    assert.equal(program.schema, OPTIMIZER_IR_SCHEMA);
    assert.equal(program.level, "O2");
    assert.equal(program.regions.length, 1);
    assert.deepEqual(program.passes.map((pass) => pass.id), [
      CLOSED_AFFINE_RECURRENCE_PASS,
    ]);
    const [region] = program.regions;
    assert.equal(region.passId, CLOSED_AFFINE_RECURRENCE_PASS);
    assert.equal(region.selected, true);
    assert.equal(region.semantic.kind, "sage.for-range.closed-affine-recurrence");
    assert.equal(region.mathematical.kind, "math.closed-affine-recurrence");
    assert.equal(region.representation.kind, "guarded-unboxed-affine-state");
    assert.equal(region.target.kind, "v8");
    assert.match(region.id, /optimizer-witness\.sage:6:/);
    assert.doesNotThrow(() => JSON.stringify(program));
    assert.doesNotThrow(() => verifyOptimizationProgram(program));
    const detached = explainOptimizationProgram(program);
    assert.deepEqual(detached, JSON.parse(JSON.stringify(detached)));
    assert.match(
      formatOptimizationExplanation(program),
      /selected math\.closed-affine-recurrence\.v1@optimizer-witness\.sage/,
    );
    const loop = findLoop(compiler, ast);
    assert.equal(loop.optimization_region.id, region.id);
    assert.equal(loop.optimization_region.kind, "closed-affine-recurrence");
  } finally {
    frontend.close();
  }
});

test("optimization levels, disable controls, and requirements fail closed", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    for (const options of [
      { optimization_level: "O0" },
      { optimization_level: "O1" },
      { optimization_disable: CLOSED_AFFINE_RECURRENCE_PASS },
    ]) {
      const ast = frontend.parse(source, optimizerOptions(options));
      assert.equal(ast.optimization_ir.regions.length, 1);
      assert.equal(ast.optimization_ir.regions[0].selected, false);
      assert.equal(findLoop(compiler, ast).optimization_region, undefined);
    }

    assert.doesNotThrow(() => frontend.parse(source, optimizerOptions({
      optimization_require: CLOSED_AFFINE_RECURRENCE_PASS,
    })));
    assert.throws(
      () => frontend.parse(source, optimizerOptions({
        optimization_level: "O0",
        optimization_require: CLOSED_AFFINE_RECURRENCE_PASS,
      })),
      /required optimization .* was not selected/,
    );
    assert.throws(
      () => frontend.parse(source, optimizerOptions({
        optimization_require: "math.nonexistent-pass.v1",
      })),
      /required optimization .* was not selected/,
    );
    assert.throws(
      () => frontend.parse(source, optimizerOptions({
        optimization_level: "Ofastest",
      })),
      /unknown Sage\.js optimization level/,
    );
  } finally {
    frontend.close();
  }
});

test("IR verification rejects malformed optimizer claims", () => {
  assert.throws(
    () => verifyOptimizationProgram({ schema: "wrong", regions: [] }),
    /unknown optimizer program schema/,
  );
  assert.throws(
    () => verifyOptimizationDecision({
      schema: OPTIMIZER_IR_SCHEMA,
      id: "bad",
      passId: CLOSED_AFFINE_RECURRENCE_PASS,
      fallbackId: "fallback",
      selected: true,
      rejectionReasons: ["contradiction"],
      semantic: { kind: "semantic" },
      mathematical: { kind: "math" },
      representation: { kind: "boxed", materializations: 0 },
      target: { kind: "v8", boundaryCrossings: 0 },
      facts: [{ kind: "fact", authority: "static", evidence: "test" }],
    }),
    /selected optimizer region .* was rejected/,
  );
});

test("nearby unsafe source shapes never receive region plans", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    for (const unsafe of [
      `for index in range(limit()):\n    value = value * multiplier + increment\n`,
      `for index in range(count):\n    value = value * value + increment\n`,
      `for multiplier in range(count):\n    value = value * multiplier + increment\n`,
      `for index in range(count):\n    value = value * multiplier + increment\n    seen += 1\n`,
      `for index in range(count):\n    value = value * multiplier + increment\nelse:\n    finished = True\n`,
      `range = custom_range\nfor index in range(count):\n    value = value * multiplier + increment\n`,
    ]) {
      const ast = frontend.parse(unsafe, optimizerOptions());
      assert.deepEqual(ast.optimization_ir.regions, []);
      assert.equal(findLoop(compiler, ast).optimization_region, undefined);
    }
  } finally {
    frontend.close();
  }
});

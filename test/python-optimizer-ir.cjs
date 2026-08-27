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
  CLOSED_RING_REGION_PASS,
  OPTIMIZER_IR_SCHEMA,
  explainOptimizationProgram,
  formatOptimizationExplanation,
  verifyInternalRegionPlan,
  verifyOptimizationDecision,
  verifyOptimizationPass,
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

const sequenceAffineSource = `
def horner(coefficients, point, initial):
    value = initial
    for coefficient in coefficients:
        value = value * point + coefficient
    return value
`;

const reversedSequenceSource = `
def reverse_horner(coefficients, point, initial):
    value = initial
    for coefficient in reversed(coefficients):
        value = value * point + coefficient
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

function findLoops(compiler, root) {
  const seen = new Set();
  const answer = [];
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    if (value instanceof compiler.AST_ForIn) {
      answer.push(value);
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

function findLoop(compiler, root) {
  return findLoops(compiler, root)[0];
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
      CLOSED_RING_REGION_PASS,
    ]);
    const [region] = program.regions;
    assert.equal(region.passId, CLOSED_RING_REGION_PASS);
    assert.equal(region.selected, true);
    assert.equal(region.semantic.kind, "sage.closed-ring-loop");
    assert.equal(region.mathematical.kind, "math.closed-commutative-ring-program");
    assert.equal(region.representation.kind, "guarded-unboxed-ring-program");
    assert.equal(region.target.kind, "adaptive");
    assert.match(region.id, /optimizer-witness\.sage:6:/);
    assert.doesNotThrow(() => JSON.stringify(program));
    assert.doesNotThrow(() => verifyOptimizationProgram(program));
    const detached = explainOptimizationProgram(program);
    assert.deepEqual(detached, JSON.parse(JSON.stringify(detached)));
    assert.match(
      formatOptimizationExplanation(program),
      /selected math\.closed-ring-region\.v1@optimizer-witness\.sage/,
    );
    const loop = findLoop(compiler, ast);
    assert.equal(loop.optimization_region.id, region.id);
    assert.equal(loop.optimization_region.kind, "closed-ring-region");
  } finally {
    frontend.close();
  }
});

test("sequence-fed affine data flow selects the transactional V8 target", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(sequenceAffineSource, optimizerOptions());
    const [region] = ast.optimization_ir.regions;
    assert.equal(region.selected, true);
    assert.equal(region.target.kind, "v8");
    assert.match(region.target.lowering, /streaming operation graph/);
    const loop = findLoop(compiler, ast);
    assert.deepEqual(loop.optimization_region.operands.affine, {
      kind: "sequence-increment",
      accumulatorSlot: 0,
      multiplierSlot: 1,
      incrementSequence: 0,
      incrementOperator: "add",
    });
    assert.doesNotThrow(() => verifyInternalRegionPlan(loop.optimization_region));
  } finally {
    frontend.close();
  }
});

test("sequence-use analysis separates streaming and packed operation graphs", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
def dot(left, right, zero):
    answer = zero
    for index in range(len(left)):
        answer = answer + left[index] * right[index]
    return answer

def squares(values, zero):
    answer = zero
    for index in range(len(values)):
        answer = answer + values[index] * values[index]
    return answer

def three_streams(left, right, third, zero):
    answer = zero
    for index in range(len(left)):
        answer = answer + left[index] * right[index] + third[index]
    return answer
`, optimizerOptions());
    assert.equal(ast.optimization_ir.regions.length, 3);
    const plans = findLoops(compiler, ast).map((loop) => loop.optimization_region);
    assert.deepEqual(
      plans.map((plan) => plan.operands.sequenceUses),
      [[1, 1], [2], [1, 1, 1]],
    );
    assert.deepEqual(
      plans.map((plan) => plan.operands.sequenceStrategy),
      ["stream", "stream", "pack"],
    );
    assert.deepEqual(
      plans.map((plan) => plan.operands.sequenceAccesses),
      [
        [
          { sequence: 0, indexOrder: "forward", uses: 1 },
          { sequence: 1, indexOrder: "forward", uses: 1 },
        ],
        [{ sequence: 0, indexOrder: "forward", uses: 2 }],
        [
          { sequence: 0, indexOrder: "forward", uses: 1 },
          { sequence: 1, indexOrder: "forward", uses: 1 },
          { sequence: 2, indexOrder: "forward", uses: 1 },
        ],
      ],
    );
  } finally {
    frontend.close();
  }
});

test("streaming commoning emits one load per target variant", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
def squares(values, zero):
    answer = zero
    for index in range(len(values)):
        answer = answer + values[index] * values[index]
    return answer
`, optimizerOptions());
    const output = new compiler.OutputStream({
      omit_baselib: true,
      write_name: false,
      private_scope: false,
      beautify: true,
      keep_docstrings: true,
      exact_integers: true,
      python_tuples: true,
      python_truthiness: true,
      python_attributes: true,
    });
    ast.print(output);
    const javascript = output.get();
    // One prime-residue target plus fixed extension degrees two through four.
    // Each target must load the immutable element once even though the graph
    // consumes it twice.
    assert.equal(
      javascript.match(/\.sequences\[0\]\[ρσ_FieldIndex\d+\]/g)?.length,
      4,
    );
  } finally {
    frontend.close();
  }
});

test("a direct builtin reversed call becomes an explicit guarded index view", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(reversedSequenceSource, optimizerOptions());
    const [region] = ast.optimization_ir.regions;
    assert.equal(region.selected, true);
    const loop = findLoop(compiler, ast);
    const plan = loop.optimization_region;
    assert.equal(plan.operands.iteratorKind, "sequence");
    assert.equal(plan.operands.iterationOrder, "reverse");
    assert.equal(plan.operands.sequenceStrategy, "stream");
    assert.deepEqual(
      plan.operands.statements[0].value.right,
      { kind: "sequence", sequence: 0, indexOrder: "reverse" },
    );
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plan,
        operands: { ...plan.operands, iterationOrder: "sideways" },
      }),
      /invalid iteration order/,
    );
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plan,
        operands: { ...plan.operands, sequenceStrategy: "pack" },
      }),
      /stale sequence strategy/,
    );
    const malformedStatements = JSON.parse(JSON.stringify(plan.operands.statements));
    malformedStatements[0].value.right.indexOrder = "sideways";
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plan,
        operands: { ...plan.operands, statements: malformedStatements },
      }),
      /sequence index order is invalid/,
    );

    const shadowed = frontend.parse(`
def not_optimized(values, reversed):
    answer = values[0]
    for value in reversed(values):
        answer = answer + value
    return answer
`, optimizerOptions());
    assert.equal(shadowed.optimization_ir.regions.length, 0);
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
      { optimization_disable: CLOSED_RING_REGION_PASS },
    ]) {
      const ast = frontend.parse(source, optimizerOptions(options));
      assert.equal(ast.optimization_ir.regions.length, 1);
      assert.equal(ast.optimization_ir.regions[0].selected, false);
      assert.equal(findLoop(compiler, ast).optimization_region, undefined);
    }

    assert.doesNotThrow(() => frontend.parse(source, optimizerOptions({
      optimization_require: CLOSED_RING_REGION_PASS,
    })));
    assert.throws(
      () => frontend.parse(source, optimizerOptions({
        optimization_level: "O0",
        optimization_require: CLOSED_RING_REGION_PASS,
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
      passId: CLOSED_RING_REGION_PASS,
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

test("verifiers reject incomplete costs, stale analyses, and unhandled operations", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(source, optimizerOptions());
    const program = JSON.parse(JSON.stringify(ast.optimization_ir));
    const incompleteCost = JSON.parse(JSON.stringify(program.regions[0]));
    delete incompleteCost.target.candidates[0].cost.copiedBytes;
    assert.throws(
      () => verifyOptimizationDecision(incompleteCost),
      /does not contain every cost component/,
    );

    const rejectedWithoutReason = JSON.parse(JSON.stringify(program.regions[0]));
    rejectedWithoutReason.target.candidates[0].availability = "rejected";
    assert.throws(
      () => verifyOptimizationDecision(rejectedWithoutReason),
      /rejectionReason must be a nonempty string/,
    );

    const stale = JSON.parse(JSON.stringify(program));
    stale.passes[0].analysisRevisionBefore = 1;
    assert.throws(
      () => verifyOptimizationProgram(stale),
      /stale analysis revision/,
    );

    assert.throws(
      () => verifyInternalRegionPlan({
        schema: OPTIMIZER_IR_SCHEMA,
        id: "bad-operation",
        passId: "test.bad.v1",
        kind: "closed-ring-region",
        operands: {
          iteratorKind: "range",
          iterationOrder: "forward",
          slots: [{ name: "x" }],
          sequences: [],
          stateSlots: [0],
          sequenceStrategy: "pack",
          sequenceUses: [],
          sequenceAccesses: [],
          statements: [{
            kind: "assign",
            target: 0,
            value: { kind: "binary", operator: "/", left: { kind: "slot", slot: 0 }, right: { kind: "slot", slot: 0 } },
          }],
        },
      }),
      /target-independent expression .* unhandled/,
    );

    assert.throws(
      () => verifyOptimizationPass({
        id: "test.incomplete.v1",
        inputSchema: OPTIMIZER_IR_SCHEMA,
        acceptedLevel: "sage-semantic",
        producedLevel: "target",
        factsConsumed: [],
        factsProduced: ["fact"],
        factsInvalidated: [],
        preserves: ["semantics"],
        guardsIntroduced: ["guard"],
        supportedTargets: ["v8"],
        verifier: "",
        compilationCostBudget: 1,
        codeSizeBudget: 1,
        requiredEvidence: ["test"],
        run() {},
      }),
      /verifier must be a nonempty string/,
    );
  } finally {
    frontend.close();
  }
});

test("nearby effects and unsupported operations never receive region plans", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    for (const unsafe of [
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

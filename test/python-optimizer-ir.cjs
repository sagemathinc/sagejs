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
        answer = answer + values[index]^2 + values[index]^2
    return answer

def three_streams(left, right, third, zero):
    answer = zero
    for index in range(len(left)):
        answer = answer + left[index] * right[index] + third[index]
    return answer

def branching(values, pivot, left, right):
    for index in range(len(values)):
        if values[index] == pivot:
            left = left + right
            right = right - values[index]
        else:
            left = left * right + values[index]^2
            right = right + left
    return left, right
`, optimizerOptions());
    assert.equal(ast.optimization_ir.regions.length, 4);
    const plans = findLoops(compiler, ast).map((loop) => loop.optimization_region);
    assert.deepEqual(
      plans.map((plan) => plan.operands.sequenceUses),
      [[1, 1], [2], [1, 1, 1], [3]],
    );
    assert.deepEqual(
      plans.map((plan) => plan.operands.sequenceStrategy),
      ["stream", "stream", "pack", "stream"],
    );
    assert.deepEqual(
      plans.map((plan) => plan.operands.operationCost),
      [2, 3, 3, 7],
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
        [{ sequence: 0, indexOrder: "forward", uses: 3 }],
      ],
    );
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plans[3],
        operands: {
          ...plans[3].operands,
          operationCost: plans[3].operands.operationCost + 1,
        },
      }),
      /stale or excessive operation cost/,
    );
  } finally {
    frontend.close();
  }
});

test("streaming commoning emits one load and one repeated product per target variant", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
def squares(values, zero):
    answer = zero
    for index in range(len(values)):
        answer = answer + values[index]^2 + values[index]^2
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
    const single = frontend.parse(`
def squares(values, zero):
    answer = zero
    for index in range(len(values)):
        answer = answer + values[index]^2
    return answer
`, optimizerOptions());
    const singleOutput = new compiler.OutputStream({
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
    single.print(singleOutput);
    assert.equal(
      javascript.match(/ \* /g)?.length,
      singleOutput.get().match(/ \* /g)?.length,
    );
  } finally {
    frontend.close();
  }
});

test("versioned value numbering shares across statements and invalidates on writes", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
def moments(values, zero):
    left = zero
    right = zero
    for item in values:
        left = left + item*item
        right = right + item*item
    return left, right

def evolving(count, left, right, value, step):
    for index in range(count):
        left = left + value*value
        value = value + step
        right = right + value*value
    return left, right, value

def branching(values, left, right, value, step, pivot):
    for item in values:
        left = left + value*value
        if left == pivot:
            value = value + step
        right = right + value*value
    return left, right, value
`, optimizerOptions());
    const plans = findLoops(compiler, ast).map((loop) => loop.optimization_region);
    assert.deepEqual(
      plans.map((plan) => plan.operands.operationCost),
      [3, 5, 6],
    );
    assert.deepEqual(
      plans.map((plan) => plan.operands.targetCodeBytes),
      [6144, 10752, 11264],
    );
    for (const plan of plans) {
      assert.doesNotThrow(() => verifyInternalRegionPlan(plan));
    }

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
    // Restrict the count to the prime target: the first region emits one
    // square, while the write and branch join each force a second square.
    const moments = javascript.slice(
      javascript.indexOf("$ρσ$py$moments = function"),
      javascript.indexOf("$ρσ$py$evolving = function"),
    );
    const evolving = javascript.slice(
      javascript.indexOf("$ρσ$py$evolving = function"),
      javascript.indexOf("$ρσ$py$branching = function"),
    );
    const branching = javascript.slice(
      javascript.indexOf("$ρσ$py$branching = function"),
    );
    const primeSquares = (target) => {
      const prime = target.slice(
        target.indexOf(".kind === 1"),
        target.indexOf("var ρσ_FieldModulusCoefficients"),
      );
      return prime.match(/\([^;\n]* \* [^;\n]*\) % ρσ_FieldModulus/g)?.length ?? 0;
    };
    assert.equal(primeSquares(moments), 1);
    assert.equal(primeSquares(evolving), 2);
    assert.equal(primeSquares(branching), 2);
  } finally {
    frontend.close();
  }
});

test("definite assignment separates iteration locals from live ring state", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
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

def partial(values, zero, pivot):
    answer = zero
    for item in values:
        if item == pivot:
            temporary = item*item
        answer = answer+item
    return answer, temporary
`, optimizerOptions());
    const loops = findLoops(compiler, ast);
    assert.equal(loops.length, 3);
    const staged = loops[0].optimization_region;
    const selected = loops[1].optimization_region;
    assert.ok(staged);
    assert.ok(selected);
    assert.equal(loops[2].optimization_region, undefined);
    assert.deepEqual(staged.operands.inputSlots, [2]);
    assert.deepEqual(staged.operands.stateSlots, [0, 1, 2]);
    assert.deepEqual(staged.operands.localSlots, [0, 1]);
    assert.equal(staged.operands.operationCost, 4);
    assert.equal(staged.operands.targetCodeBytes, 10240);
    assert.deepEqual(selected.operands.inputSlots, [0, 2]);
    assert.deepEqual(selected.operands.stateSlots, [1, 2]);
    assert.deepEqual(selected.operands.localSlots, [1]);
    assert.equal(selected.operands.operationCost, 4);
    assert.equal(selected.operands.targetCodeBytes, 6656);
    assert.doesNotThrow(() => verifyInternalRegionPlan(staged));
    assert.doesNotThrow(() => verifyInternalRegionPlan(selected));
    assert.throws(
      () => verifyInternalRegionPlan({
        ...staged,
        operands: { ...staged.operands, inputSlots: [0, 2] },
      }),
      /stale input slots/,
    );
    assert.throws(
      () => verifyInternalRegionPlan({
        ...staged,
        operands: { ...staged.operands, localSlots: [1] },
      }),
      /stale local slots/,
    );
  } finally {
    frontend.close();
  }
});

test("value numbering uses guarded commutativity but preserves subtraction order", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
def symmetric(left_values, right_values, zero):
    left = zero
    right = zero
    for x, y in zip(left_values, right_values):
        left = left+x*y
        right = right+y*x
    return left, right

def ordered(left_values, right_values, zero):
    left = zero
    right = zero
    for x, y in zip(left_values, right_values):
        left = left+(x-y)
        right = right+(y-x)
    return left, right

def regrouped(values, zero, a, b):
    left = zero
    right = zero
    for x in values:
        left = left+(x*a)*b
        right = right+x*(b*a)
    return left, right
`, optimizerOptions());
    const plans = findLoops(compiler, ast).map((loop) => loop.optimization_region);
    assert.deepEqual(
      plans.map((plan) => plan.operands.operationCost),
      [3, 4, 4],
    );
    assert.deepEqual(
      plans.map((plan) => plan.operands.targetCodeBytes),
      [6144, 3072, 10240],
    );
    for (const plan of plans) {
      assert.doesNotThrow(() => verifyInternalRegionPlan(plan));
    }
  } finally {
    frontend.close();
  }
});

test("pure invariant ring subgraphs move to the guarded preheader", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
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
`, optimizerOptions());
    const plans = findLoops(compiler, ast).map((loop) => loop.optimization_region);
    assert.deepEqual(
      plans.map((plan) => plan.operands.preheaderOperationCost),
      [1, 1],
    );
    assert.deepEqual(
      plans.map((plan) => plan.operands.operationCost),
      [2, 5],
    );
    assert.deepEqual(
      plans.map((plan) => plan.operands.targetCodeBytes),
      [9728, 14848],
    );
    for (const plan of plans) {
      assert.equal(plan.operands.hoistedExpressions.length, 1);
      assert.equal(plan.operands.hoistedExpressions[0].kind, "binary");
      assert.equal(plan.operands.hoistedExpressions[0].operator, "*");
      assert.doesNotThrow(() => verifyInternalRegionPlan(plan));
    }
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plans[0],
        operands: { ...plans[0].operands, hoistedExpressions: [] },
      }),
      /stale hoisted expressions/,
    );
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plans[0],
        operands: {
          ...plans[0].operands,
          preheaderOperationCost: plans[0].operands.preheaderOperationCost + 1,
        },
      }),
      /stale preheader operation cost/,
    );
  } finally {
    frontend.close();
  }
});

test("dead stores are removed only from the verified lowered statement graph", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
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
`, optimizerOptions());
    const [plan, branchPlan] = findLoops(compiler, ast).map(
      (loop) => loop.optimization_region,
    );
    assert.equal(plan.operands.semanticStatements.length, 3);
    assert.equal(plan.operands.statements.length, 2);
    assert.equal(plan.operands.eliminatedAssignments, 1);
    assert.deepEqual(plan.operands.operations, ["add", "mul"]);
    assert.deepEqual(plan.operands.sequenceUses, [4]);
    assert.deepEqual(plan.operands.loweredSequenceUses, [2]);
    assert.equal(plan.operands.operationCost, 2);
    assert.doesNotThrow(() => verifyInternalRegionPlan(plan));
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plan,
        operands: { ...plan.operands, eliminatedAssignments: 0 },
      }),
      /stale eliminated-assignment count/,
    );
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plan,
        operands: {
          ...plan.operands,
          statements: plan.operands.semanticStatements,
        },
      }),
      /stale dead-store elimination/,
    );
    assert.throws(
      () => verifyInternalRegionPlan({
        ...plan,
        operands: { ...plan.operands, operations: ["add"] },
      }),
      /stale operations/,
    );
    assert.equal(branchPlan.operands.semanticStatements.length, 3);
    assert.equal(branchPlan.operands.statements.length, 2);
    assert.equal(branchPlan.operands.statements.some(
      (statement) => statement.kind === "if",
    ), false);
    assert.equal(branchPlan.operands.eliminatedAssignments, 2);
    assert.deepEqual(branchPlan.operands.operations, ["add", "equal", "mul"]);
    assert.deepEqual(branchPlan.operands.sequenceUses, [6]);
    assert.deepEqual(branchPlan.operands.loweredSequenceUses, [1]);
    assert.doesNotThrow(() => verifyInternalRegionPlan(branchPlan));
  } finally {
    frontend.close();
  }
});

test("compact powers respect the advertised outlined-target code budget", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(`
for index in range(count):
    answer = answer + values[index]^19 - values[index]^65537
`, optimizerOptions());
    const output = new compiler.OutputStream({
      omit_baselib: true,
      write_name: false,
      private_scope: false,
      beautify: false,
      keep_docstrings: true,
      exact_integers: true,
      python_tuples: true,
      python_truthiness: true,
      python_attributes: true,
    });
    ast.print(output);
    const javascript = output.get();
    const loop = findLoops(compiler, ast)[0];
    const pass = ast.optimization_ir.passes.find((candidate) =>
      candidate.id === CLOSED_RING_REGION_PASS
    );
    assert.ok(loop.optimization_region);
    assert.equal(loop.optimization_region.operands.targetCodeBytes, 4096);
    assert.ok(Buffer.byteLength(javascript) <= pass.codeSizeBudget);
    assert.equal(
      javascript.match(/ρσ_machine_field_power\(/g)?.length,
      8,
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
          semanticStatements: [{
            kind: "assign",
            target: 0,
            value: { kind: "binary", operator: "/", left: { kind: "slot", slot: 0 }, right: { kind: "slot", slot: 0 } },
          }],
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
      () => verifyInternalRegionPlan({
        schema: OPTIMIZER_IR_SCHEMA,
        id: "bad-power",
        passId: CLOSED_RING_REGION_PASS,
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
          semanticStatements: [{
            kind: "assign",
            target: 0,
            value: {
              kind: "power",
              exponent: 9007199254740992,
              value: { kind: "slot", slot: 0 },
            },
          }],
          statements: [{
            kind: "assign",
            target: 0,
            value: {
              kind: "power",
              exponent: 9007199254740992,
              value: { kind: "slot", slot: 0 },
            },
          }],
        },
      }),
      /target-independent expression power is unhandled/,
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

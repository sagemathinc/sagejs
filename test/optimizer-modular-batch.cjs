// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const { createSage } = require("../dist/tools/kernel.js");
const {
  MODULAR_BATCH_REGION_PASS,
} = require("../dist/tools/python/optimizer/domains/modular-batch/ir.js");
const {
  recognizeModularBatchProgram,
} = require(
  "../dist/tools/python/optimizer/domains/modular-batch/recognize.js"
);
const {
  planModularBatchRepresentation,
} = require("../dist/tools/python/optimizer/representations/modular-batch.js");
const {
  emitV8ModularBatchKernel,
  planModularBatchTargets,
} = require("../dist/tools/python/optimizer/targets/modular-batch.js");
const {
  verifyModularBatchInternalRegionPlan,
} = require("../dist/tools/python/optimizer/verifiers/modular-batch.js");
const {
  modularBatchRegionPass,
} = require("../dist/tools/python/optimizer/passes/modular-batch-region.js");

function frontendOptions(filename = "optimizer-modular-batch.py") {
  return {
    filename,
    for_linting: true,
    libdir: path.join(__dirname, "../src/lib"),
    import_dirs: [],
    exact_integer_literals: true,
    strict_python_scopes: true,
    optimization_level: "O0",
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
  };
}

function batchSource(expression, allocation = "[None for _slot in range(count)]") {
  return `
def batch(count, left, right, third):
    out = ${allocation}
    for index in range(count):
        out[index] = ${expression}
    return out
`;
}

async function parseBatch(source) {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(source, frontendOptions());
    const definition = ast.body.find((node) => node instanceof compiler.AST_Function);
    const loop = definition.body.find((node) => node instanceof compiler.AST_ForIn);
    return { compiler, definition, loop };
  } finally {
    frontend.close();
  }
}

function represented(recognition) {
  assert.equal(recognition.accepted, true, recognition.reasons?.join(","));
  return planModularBatchTargets(
    planModularBatchRepresentation(recognition.program),
  );
}

function internal(plan) {
  return {
    schema: "sagejs.optimizing-mathematics/v1",
    id: "test-modular-batch-region",
    passId: "math.modular-batch-region.v1",
    loweringId: "v8.modular-batch-loop.v1",
    functionId: null,
    guardFailure: "fallback",
    kind: "modular-batch-region",
    operands: plan,
  };
}

function canonicalBigInt(value, modulus) {
  let answer = value % modulus;
  if (answer < 0n) answer += modulus;
  return answer;
}

function evaluateOracle(expression, inputs, constants, modulus, index) {
  if (expression.kind === "input") return BigInt(inputs[expression.input][index]);
  if (expression.kind === "integer-constant") {
    return canonicalBigInt(BigInt(expression.value), modulus);
  }
  if (expression.kind === "neg") {
    return canonicalBigInt(
      -evaluateOracle(expression.value, inputs, constants, modulus, index),
      modulus,
    );
  }
  const left = evaluateOracle(expression.left, inputs, constants, modulus, index);
  const right = evaluateOracle(expression.right, inputs, constants, modulus, index);
  const value = expression.operator === "+" ? left + right :
    expression.operator === "-" ? left - right : left * right;
  return canonicalBigInt(value, modulus);
}

function compileKernel(plan) {
  const source = emitV8ModularBatchKernel(plan);
  return {
    source,
    kernel: Function(`"use strict"; return (${source});`)(),
  };
}

function generatedInputs(modulus, count, seed) {
  let state = BigInt(seed);
  const next = () => {
    state = (state * 6364136223846793005n + 1442695040888963407n) &
      ((1n << 64n) - 1n);
    return Number(state % BigInt(modulus));
  };
  const result = Array.from({ length: 3 }, () =>
    Float64Array.from({ length: count }, next));
  // Exercise every extreme used by the intermediate-bound proof, including
  // `(p - 1)^2` at the largest admitted modulus.
  if (count >= 4) {
    result[0].set([modulus - 1, modulus - 2, 0, 1]);
    result[1].set([modulus - 1, 1, modulus - 1, 0]);
    result[2].set([0, modulus - 1, 1, modulus - 2]);
  }
  return result;
}

test("recognition records the complete output alias proof and exact bounds", async () => {
  const { compiler, definition, loop } = await parseBatch(
    batchSource("-(left[index] - right[index]) * third[index] + 7"),
  );
  const plan = represented(
    recognizeModularBatchProgram(compiler, loop, definition),
  );
  assert.deepEqual(plan.inputs.map(({ name, uses }) => [name, uses]), [
    ["left", 1], ["right", 1], ["third", 1],
  ]);
  assert.deepEqual(plan.aliasProof, {
    kind: "fresh-list-comprehension",
    outputName: "out",
    allocationStatementIndex: 0,
    allocationCountName: "count",
    disjointInputNames: ["left", "right", "third"],
    inputInputAliasing: "allowed-read-only",
    publication: "after-complete-validation-and-private-computation",
  });
  assert.deepEqual(plan.operations, ["add", "coerce-integer", "mul", "neg", "sub"]);
  assert.equal(plan.representation.exactBounds.modulusMaximum, 94_906_266);
  assert.deepEqual(
    plan.representation.exactBounds.intermediates.map((bound) => [
      bound.operation, bound.formula, bound.maximumAtAcceptedModulus,
    ]),
    [
      ["add", "2 * (p - 1)", 189_812_530],
      ["sub", "2 * (p - 1)", 189_812_530],
      ["mul", "(p - 1) * (p - 1)", 9_007_199_136_250_225],
      ["neg", "p - 1", 94_906_265],
    ],
  );
  verifyModularBatchInternalRegionPlan(internal(plan));
});

test("generated modular graphs agree with an independent BigInt oracle", async () => {
  const expressions = [
    "left[index] * right[index] + 7",
    "left[index] + right[index] - third[index]",
    "-(left[index] - right[index]) * third[index] + 1234567",
    "(left[index] * left[index] + right[index] * third[index]) - 19",
    "-(-left[index] + 41) * (right[index] - third[index])",
  ];
  const moduli = [2, 3, 97, 1009, 65_521, 94_906_266];
  for (let expressionIndex = 0; expressionIndex < expressions.length; expressionIndex += 1) {
    const { compiler, definition, loop } = await parseBatch(
      batchSource(expressions[expressionIndex]),
    );
    const plan = represented(
      recognizeModularBatchProgram(compiler, loop, definition),
    );
    verifyModularBatchInternalRegionPlan(internal(plan));
    const { source, kernel } = compileKernel(plan);
    assert.match(source, /Float64Array/);
    assert.doesNotMatch(source, /BigInt|eval|Function/);
    for (const modulus of moduli) {
      const count = 37;
      const inputs = generatedInputs(modulus, count, 100 + expressionIndex);
      const constants = plan.integerConstants.map((value) =>
        Number(canonicalBigInt(BigInt(value), BigInt(modulus))));
      const actual = kernel(inputs, constants, modulus, count);
      const expected = Array.from({ length: count }, (_value, index) =>
        Number(evaluateOracle(
          plan.expression, inputs, constants, BigInt(modulus), index,
        )));
      assert.deepEqual([...actual], expected, `${expressions[expressionIndex]} mod ${modulus}`);
    }
    assert.deepEqual(
      [...kernel([new Float64Array(0), new Float64Array(0), new Float64Array(0)],
        plan.integerConstants.map(() => 0), 97, 0)],
      [],
    );
  }
});

test("the independent verifier rejects mutated alias, range, and target claims", async () => {
  const { compiler, definition, loop } = await parseBatch(
    batchSource("left[index] * right[index] + 7"),
  );
  const plan = represented(
    recognizeModularBatchProgram(compiler, loop, definition),
  );
  const mutations = [
    { ...plan, operationCost: plan.operationCost + 1 },
    {
      ...plan,
      aliasProof: { ...plan.aliasProof, disjointInputNames: ["left"] },
    },
    {
      ...plan,
      representation: {
        ...plan.representation,
        methodGuardMask: plan.representation.methodGuardMask ^ 4,
      },
    },
    {
      ...plan,
      representation: {
        ...plan.representation,
        exactBounds: {
          ...plan.representation.exactBounds,
          modulusMaximum: 94_906_267,
        },
      },
    },
    {
      ...plan,
      targetComparison: {
        ...plan.targetComparison,
        estimates: plan.targetComparison.estimates.map((estimate, index) =>
          index === 2 ? {
            ...estimate,
            structuralCost: {
              ...estimate.structuralCost,
              copiedBytes: { fixed: 0, perElement: 0 },
            },
          } : estimate),
      },
    },
    {
      ...plan,
      targetComparison: {
        ...plan.targetComparison,
        emittedV8Bytes: Number.NaN,
      },
    },
    {
      ...plan,
      inputs: plan.inputs.map((input, index) => index === 0 ? {
        ...input,
        node: { ...input.node, python_lexical_binding: false },
      } : input),
    },
    { ...plan, targetCodeBytes: plan.targetCodeBytes - 1 },
  ];
  for (const mutation of mutations) {
    assert.throws(
      () => verifyModularBatchInternalRegionPlan(internal(mutation)),
      /invalid modular batch plan/,
    );
  }
});

test("unproved indexed outputs and accesses have stable rejection reasons", async () => {
  const cases = [
    [batchSource("left[index] + right[index]", "[None] * count"),
      "output-allocation-not-proven"],
    [batchSource("out[index] + left[index]"),
      "indexed-output-alias-unproven"],
    [batchSource("left[index + 1] + right[index]"),
      "modular-expression-unsupported"],
    [`
def batch(count, out, left, right, third):
    for index in range(count):
        out[index] = left[index] + right[index]
    return out
`, "output-allocation-not-proven"],
  ];
  for (const [source, reason] of cases) {
    const { compiler, definition, loop } = await parseBatch(source);
    assert.deepEqual(
      recognizeModularBatchProgram(compiler, loop, definition),
      { accepted: false, reasons: [reason] },
    );
  }
});

test("the pass is inert without its exact function contract", async () => {
  const parsed = await parseBatch(batchSource("left[index] * right[index] + 7"));
  const submitted = [];
  const observed = [];
  const context = {
    compiler: parsed.compiler,
    controls: {
      level: "O2",
      disabledPasses: new Set(),
      requiredOptimizations: new Set(),
      explain: false,
    },
    walk(_root, visitor) {
      visitor(parsed.loop, [parsed.definition]);
    },
    consider(candidate) {
      submitted.push(candidate);
    },
    observe(observation) {
      observed.push(observation);
    },
  };
  modularBatchRegionPass.run({}, context);
  assert.equal(submitted.length, 0);
  assert.equal(observed.length, 0);
  parsed.definition.optimization_contract = {
    requiredPassId: MODULAR_BATCH_REGION_PASS,
  };
  modularBatchRegionPass.run({}, context);
  assert.equal(submitted.length, 1);
  assert.equal(observed.length, 0);
  assert.equal(submitted[0].internal.loweringId, "v8.modular-batch-loop.v1");
  assert.deepEqual(
    submitted[0].decision.target.candidates.map((candidate) => [
      candidate.kind, candidate.availability,
    ]),
    [
      ["v8", "selected"], ["wasm", "rejected"],
      ["native", "rejected"], ["generic", "available"],
    ],
  );
});

test("O0 indexed modular batches match the exact oracle, including zero trips", async () => {
  const previousLevel = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = "O0";
  let session;
  try {
    session = await createSage();
  } finally {
    if (previousLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previousLevel;
  }
  try {
    const result = await session.evaluate(`
R = Zmod(1009)
def batch(count, left, right):
    out = [None for _slot in range(count)]
    for index in range(count):
        out[index] = -(left[index] - right[index]) * left[index] + 7
    return out
left = tuple(R((17*i + 3) % 1009) for i in range(23))
right = tuple(R((31*i + 11) % 1009) for i in range(23))
print([int(value) for value in batch(23, left, right)])
print(batch(0, tuple(), tuple()))
`);
    const expected = Array.from({ length: 23 }, (_value, index) => {
      const left = BigInt((17 * index + 3) % 1009);
      const right = BigInt((31 * index + 11) % 1009);
      return Number(canonicalBigInt(-(left - right) * left + 7n, 1009n));
    });
    assert.equal(result.stdout, `[${expected.join(", ")}]\n[]\n`);
  } finally {
    await session.close();
  }
});

test("the Python emitter is standalone, CPython-parseable, and transactional", () => {
  const filename = path.join(
    __dirname, "../src/output/optimizer/modular_batch.py",
  );
  const source = fs.readFileSync(filename, "utf8");
  assert.doesNotMatch(source, /output\.optimizer\.scalar/);
  assert.match(source, /prepare_machine_field_region/);
  assert.match(source, /sequence-element-representation-mismatch/);
  assert.match(source, /private output storage|verified complete modular residue batch/i);
  const parsed = spawnSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], {
    input: source,
    encoding: "utf8",
  });
  assert.equal(parsed.status, 0, parsed.stderr || parsed.stdout);
});

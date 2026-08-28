// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const createCompiler = require("../dist/tools/compiler.js").default;
const { createSage } = require("../dist/tools/kernel.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  boundedIntegerRegionPass,
} = require(
  "../dist/tools/python/optimizer/passes/bounded-integer-region.js"
);
const {
  BOUNDED_INTEGER_LOWERING,
  BOUNDED_INTEGER_REGION_PASS,
} = require(
  "../dist/tools/python/optimizer/domains/bounded-integer/model.js"
);
const {
  runCheckedBoundedIntegerPlan,
} = require(
  "../dist/tools/python/optimizer/targets/v8-bounded-integer.js"
);
const {
  verifyBoundedIntegerPlan,
} = require(
  "../dist/tools/python/optimizer/verifiers/bounded-integer.js"
);
const {
  verifyOptimizationDecision,
} = require("../dist/tools/python/optimizer/verifier.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = path.resolve(__dirname, "..");
const parserOptions = {
  filename: "<optimizer-bounded-integer>",
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

const additionSource = `
def bounded_add(n: int, value: int, step: int) -> int:
    for index in range(n):
        value += step
    return value
`;

const mixedSource = `
def bounded_mix(n: int, left: int, right: int, pivot: int):
    for index in range(n):
        product = left * right
        if product == pivot:
            left = product - right
        else:
            left = product + right
        right = right - left
    return left, right
`;

function walk(compiler, rootNode, visitor) {
  const seen = new Set();
  const visit = (value, ancestors) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, ancestors));
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    visitor(value, ancestors);
    const next = [...ancestors, value];
    for (const [key, child] of Object.entries(value)) {
      if (["start", "end", "scope", "thedef", "imports", "globals",
           "optimization_ir", "optimization_region"].includes(key)) continue;
      if (typeof child !== "function") visit(child, next);
    }
  };
  visit(rootNode, []);
}

async function parseUnoptimized(source) {
  const oldLevel = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = "O0";
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    return { compiler, ast: frontend.parse(source, parserOptions) };
  } finally {
    frontend.close();
    if (oldLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = oldLevel;
  }
}

function collectBounded(compiler, ast) {
  const candidates = [];
  const observations = [];
  const context = {
    compiler,
    controls: {
      level: "O2",
      disabledPasses: new Set(),
      requiredOptimizations: new Set(),
      explain: true,
    },
    walk(rootNode, visitor) {
      walk(compiler, rootNode, visitor);
    },
    consider(candidate) {
      candidates.push(candidate);
    },
    observe(observation) {
      observations.push(observation);
    },
  };
  boundedIntegerRegionPass.run(ast, context);
  return { candidates, observations };
}

function runCPython(source) {
  const result = spawnSync(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.replaceAll("\r\n", "\n");
}

async function o0Output(source) {
  const oldLevel = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = "O0";
  const sage = await createSage({ mode: "python" });
  try {
    return (await sage.evaluate(source)).stdout;
  } finally {
    await sage.close();
    if (oldLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = oldLevel;
  }
}

test("bounded exact integers export one stable explainable plugin contract", () => {
  assert.equal(boundedIntegerRegionPass.id, BOUNDED_INTEGER_REGION_PASS);
  assert.equal(BOUNDED_INTEGER_REGION_PASS, "math.bounded-integer-region.v1");
  assert.equal(BOUNDED_INTEGER_LOWERING, "v8.bounded-integer-loop.v1");
  assert.ok(boundedIntegerRegionPass.factsProduced.includes(
    "checked-exact-intermediates",
  ));
  assert.ok(boundedIntegerRegionPass.requiredEvidence.includes(
    "cubic-class-group-negative-control",
  ));
});

test("the fused plan has normalized IR, exact costs, and an independent verifier", async () => {
  const { compiler, ast } = await parseUnoptimized(mixedSource);
  const { candidates, observations } = collectBounded(compiler, ast);
  assert.equal(observations.length, 0);
  assert.equal(candidates.length, 1);
  const candidate = candidates[0];
  assert.equal(candidate.internal.loweringId, BOUNDED_INTEGER_LOWERING);
  assert.deepEqual(candidate.internal.operands.operations, ["add", "equal", "mul", "sub"]);
  assert.deepEqual(
    candidate.internal.operands.annotatedIntegerArguments.map(
      ({ argument }) => argument.name,
    ),
    ["left", "right", "pivot"],
  );
  assert.doesNotThrow(() => verifyBoundedIntegerPlan(candidate.internal));
  assert.doesNotThrow(() => verifyOptimizationDecision({
    ...candidate.decision,
    functionId: null,
    selected: true,
    rejectionReasons: [],
  }));
  assert.throws(
    () => verifyBoundedIntegerPlan({
      ...candidate.internal,
      operands: {
        ...candidate.internal.operands,
        rangeFacts: candidate.internal.operands.rangeFacts.slice(1),
      },
    }),
    /range facts/,
  );
  const malformed = structuredClone(candidate.internal.operands.statements);
  malformed[0].value.operator = "/";
  assert.throws(
    () => verifyBoundedIntegerPlan({
      ...candidate.internal,
      operands: { ...candidate.internal.operands, statements: malformed },
    }),
    /expression|dead-store/,
  );
});

test("checked Number execution agrees with exact BigInt, Sage.js O0, and CPython", async () => {
  const { compiler, ast } = await parseUnoptimized(additionSource);
  const { candidates } = collectBounded(compiler, ast);
  const plan = candidates[0].internal.operands;
  for (const [count, value, step] of [
    [1, 0, 1],
    [17, -200, 13],
    [1000, 123456, -77],
    [4096, -1000000, 211],
  ]) {
    const result = runCheckedBoundedIntegerPlan(plan, count, [value, step]);
    const exact = BigInt(value) + BigInt(count) * BigInt(step);
    assert.equal(result.ok, true);
    assert.equal(BigInt(result.values[0]), exact);
  }
  const differential = `${additionSource}
print(bounded_add(17, -200, 13))
print(bounded_add(0, 9007199254740992, 1))
print(bounded_add(2, 9007199254740991, 1))
`;
  const [sageOutput, pythonOutput] = await Promise.all([
    o0Output(differential),
    Promise.resolve(runCPython(differential)),
  ]);
  assert.equal(sageOutput, pythonOutput);
  assert.equal(sageOutput, "21\n9007199254740992\n9007199254740993\n");
});

test("overflow, aliases, mutation-bearing values, and zero trips fail closed", async () => {
  const multiplication = `
def bounded_mul(n: int, value: int, factor: int) -> int:
    for index in range(n):
        value *= factor
    return value
`;
  const { compiler, ast } = await parseUnoptimized(multiplication);
  const { candidates } = collectBounded(compiler, ast);
  const plan = candidates[0].internal.operands;
  const inputs = Object.freeze([9007199254740991, 2]);
  const overflow = runCheckedBoundedIntegerPlan(plan, 1, inputs);
  assert.deepEqual(overflow, {
    ok: false,
    reason: "intermediate-overflow",
    values: [...inputs],
    iterations: 1,
  });
  assert.deepEqual(inputs, [9007199254740991, 2]);

  let reads = 0;
  const hostile = new Proxy({}, {
    get() {
      reads += 1;
      return 1;
    },
  });
  const rejected = runCheckedBoundedIntegerPlan(plan, 2, [hostile, hostile]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "live-in-not-exact-number");
  assert.equal(reads, 0);
  assert.equal(runCheckedBoundedIntegerPlan(plan, 2, [1n, 2]).ok, false);

  const identity = { sentinel: true };
  const zero = runCheckedBoundedIntegerPlan(plan, 0, [identity, identity]);
  assert.equal(zero.ok, true);
  assert.equal(zero.values[0], identity);
  assert.equal(zero.values[1], identity);
});

test("interrupt polling cannot publish private scalar state", async () => {
  const { compiler, ast } = await parseUnoptimized(additionSource);
  const { candidates } = collectBounded(compiler, ast);
  const plan = candidates[0].internal.operands;
  const inputs = Object.freeze([10, 3]);
  let polls = 0;
  assert.throws(
    () => runCheckedBoundedIntegerPlan(plan, 100, inputs, {
      interruptInterval: 4,
      pollInterrupt() {
        polls += 1;
        throw new Error("interrupt");
      },
    }),
    /interrupt/,
  );
  assert.equal(polls, 1);
  assert.deepEqual(inputs, [10, 3]);
});

test("unsupported integer and packed cubic shapes are explain-only", async () => {
  const source = `
def quotient(n: int, value: int, divisor: int):
    for index in range(n):
        value = value // divisor
    return value

def packed_candidate(metadata: IntegerBuffer, bound: int):
    index = 0
    while index < bound:
        metadata[index] = (bound * index) % 7
        index += 1
`;
  const { compiler, ast } = await parseUnoptimized(source);
  const { candidates, observations } = collectBounded(compiler, ast);
  assert.equal(candidates.length, 0);
  assert.equal(observations.length, 2);
  const reasons = observations.flatMap((item) => item.rejectionReasons);
  assert.ok(reasons.includes("bounded-integer.unsupported-operation://"));
  assert.ok(reasons.includes("bounded-integer.mutable-buffer-access"));
  assert.ok(reasons.includes("bounded-integer.unsupported-iterator"));
  for (const observation of observations) {
    assert.equal(observation.decision.target.kind, "generic");
    assert.equal(observation.decision.target.selectedCandidate,
      "generic-exact-integer-fallback");
    assert.doesNotThrow(() => verifyOptimizationDecision({
      ...observation.decision,
      functionId: null,
      selected: false,
      rejectionReasons: observation.rejectionReasons,
    }));
  }
});

test("the isolated Python emitter is inspectable and uses immutable intrinsics", () => {
  const emitter = fs.readFileSync(
    path.join(root, "src/output/optimizer/bounded_integer.py"),
    "utf8",
  );
  assert.match(emitter, /intermediate-overflow/);
  assert.match(emitter, /print_interrupt_check/);
  assert.match(emitter, /_print_bounded_integer_fallback/);
  assert.match(emitter, /transactional Number locals/);
  assert.doesNotMatch(emitter, /Number\.isSafeInteger/);
  const parsed = spawnSync(pythonExecutable(), ["-m", "py_compile",
    path.join(root, "src/output/optimizer/bounded_integer.py")], {
    encoding: "utf8",
  });
  assert.equal(parsed.status, 0, parsed.stderr || parsed.stdout);
});

test("held-out cubic evidence remains a negative control", () => {
  const evidence = JSON.parse(fs.readFileSync(
    path.join(root,
      "bench/optimizer-bounded-integer/held-out-cubic-negative-control.json"),
    "utf8",
  ));
  assert.equal(evidence.route_decision, "reject-current-generated-javascript");
  assert.ok(evidence.call_only.javascript_nanoseconds /
    evidence.call_only.native_nanoseconds > 20);
  assert.equal(evidence.required_rejection_reasons.includes(
    "bounded-integer.mutable-buffer-access",
  ), true);
  assert.equal(evidence.required_rejection_reasons.includes(
    "bounded-integer.unsupported-operation:%",
  ), true);
});

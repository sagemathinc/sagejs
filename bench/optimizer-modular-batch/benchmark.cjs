"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { default: createCompiler } = require("../../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../../dist/tools/python/compiler-frontend.js");
const { createSage } = require("../../dist/tools/kernel.js");
const {
  recognizeModularBatchProgram,
} = require(
  "../../dist/tools/python/optimizer/domains/modular-batch/recognize.js"
);
const {
  planModularBatchRepresentation,
} = require(
  "../../dist/tools/python/optimizer/representations/modular-batch.js"
);
const {
  emitV8ModularBatchKernel,
  planModularBatchTargets,
} = require("../../dist/tools/python/optimizer/targets/modular-batch.js");
const {
  verifyModularBatchInternalRegionPlan,
} = require("../../dist/tools/python/optimizer/verifiers/modular-batch.js");

const check = process.argv.includes("--check");
const count = Number(process.env.SAGEJS_MODULAR_BATCH_COUNT ?? 100_000);
const modulus = 65_521;
const genericCount = 512;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function time(callable, samples = 9) {
  const values = [];
  let answer;
  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    answer = callable();
    values.push(performance.now() - start);
  }
  return { milliseconds: median(values), answer };
}

function canonical(value) {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
}

class Residue {
  constructor(value) {
    this.value = canonical(value);
  }

  add(other) {
    return new Residue(this.value + other.value);
  }

  sub(other) {
    return new Residue(this.value - other.value);
  }

  mul(other) {
    return new Residue(this.value * other.value);
  }
}

function genericBatch(inputs, constant) {
  const output = new Array(inputs[0].length);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = inputs[0][index].mul(inputs[1][index])
      .add(inputs[2][index].mul(inputs[0][index]))
      .sub(constant);
  }
  return output;
}

function checksum(values, accessor) {
  let result = 0n;
  for (const value of values) {
    result = (result * 1_000_003n + BigInt(accessor(value))) % 4_294_967_291n;
  }
  return result;
}

async function optimizerPlan() {
  const source = `
def batch(count, left, right, third):
    out = [None for _slot in range(count)]
    for index in range(count):
        out[index] = left[index] * right[index] + third[index] * left[index] - 19
    return out
`;
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(source, {
      filename: "benchmark-modular-batch.py",
      for_linting: true,
      libdir: path.join(__dirname, "../../src/lib"),
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
    });
    const definition = ast.body.find((node) =>
      node instanceof compiler.AST_Function);
    const loop = definition.body.find((node) =>
      node instanceof compiler.AST_ForIn);
    const recognition = recognizeModularBatchProgram(
      compiler, loop, definition,
    );
    assert.equal(recognition.accepted, true);
    return planModularBatchTargets(
      planModularBatchRepresentation(recognition.program),
    );
  } finally {
    frontend.close();
  }
}

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

async function measureSageO0() {
  const session = await sessionAtLevel("O0");
  try {
    const result = await session.evaluate(`
import time
R = Zmod(${modulus})
left = tuple(R((17*index + 3) % ${modulus}) for index in range(${genericCount}))
right = tuple(R((31*index + 4) % ${modulus}) for index in range(${genericCount}))
third = tuple(R((45*index + 5) % ${modulus}) for index in range(${genericCount}))
def batch(count, left, right, third):
    out = [None for _slot in range(count)]
    for index in range(count):
        out[index] = left[index] * right[index] + third[index] * left[index] - 19
    return out
for sample in range(5):
    started = time.time()
    answer = batch(${genericCount}, left, right, third)
    elapsed = time.time() - started
    checksum = 0
    for value in answer:
        checksum = (checksum * 1000003 + int(value)) % 4294967291
    print('o0', elapsed, checksum)
`);
    const timings = [];
    let exactChecksum = null;
    for (const line of result.stdout.trim().split(/\r?\n/)) {
      const match = line.match(/^o0 ([0-9.eE+-]+) (\d+)$/);
      assert.ok(match, line);
      timings.push(Number(match[1]) * 1000);
      exactChecksum = match[2];
    }
    return { milliseconds: median(timings), exactChecksum };
  } finally {
    await session.close();
  }
}

async function main() {
  const planningStart = performance.now();
  const plan = await optimizerPlan();
  const planningMilliseconds = performance.now() - planningStart;
  verifyModularBatchInternalRegionPlan({
    schema: "sagejs.optimizing-mathematics/v1",
    id: "benchmark-modular-batch-region",
    passId: "math.modular-batch-region.v1",
    loweringId: "v8.modular-batch-loop.v1",
    functionId: null,
    guardFailure: "fallback",
    kind: "modular-batch-region",
    operands: plan,
  });
  const targetSource = emitV8ModularBatchKernel(plan);
  const compileStart = performance.now();
  const kernel = Function(`"use strict"; return (${targetSource});`)();
  const compileMilliseconds = performance.now() - compileStart;

  const rawInputs = Array.from({ length: 3 }, (_unused, input) =>
    Float64Array.from({ length: count }, (_value, index) =>
      (index * (17 + 14 * input) + 3 + input) % modulus));
  const boxedInputs = rawInputs.map((values) =>
    Object.freeze([...values].map((value) => Object.freeze(new Residue(value)))));
  const constant = new Residue(19);
  const constants = [19];

  const inclusiveV8 = () => {
    const packed = boxedInputs.map((values) =>
      Float64Array.from(values, (value) => value.value));
    const staged = kernel(packed, constants, modulus, count);
    return Array.from(staged, (value) => new Residue(value));
  };
  for (let warmup = 0; warmup < 4; warmup += 1) {
    inclusiveV8();
    genericBatch(boxedInputs, constant);
  }
  const rawV8 = time(() => kernel(rawInputs, constants, modulus, count));
  const v8 = time(inclusiveV8);
  const generic = time(() => genericBatch(boxedInputs, constant));
  const sageO0 = await measureSageO0();
  const v8Checksum = checksum(v8.answer, (value) => value.value);
  const genericChecksum = checksum(generic.answer, (value) => value.value);
  assert.equal(v8Checksum, genericChecksum);
  const prefixChecksum = checksum(
    genericBatch(
      boxedInputs.map((values) => values.slice(0, genericCount)),
      constant,
    ),
    (value) => value.value,
  );
  assert.equal(sageO0.exactChecksum, prefixChecksum.toString());

  const estimates = Object.fromEntries(plan.targetComparison.estimates.map((estimate) => [
    estimate.kind,
    {
      availability: estimate.availability,
      rejectionReason: estimate.rejectionReason,
      structuralCost: estimate.structuralCost,
      score: estimate.score,
    },
  ]));
  const report = {
    workload: "three-input complete modular residue batch",
    count,
    modulus,
    exactChecksum: v8Checksum.toString(),
    compiler: {
      planMilliseconds: planningMilliseconds,
      targetCompileMilliseconds: compileMilliseconds,
      emittedBytes: targetSource.length,
      budgetBytes: plan.targetCodeBytes,
    },
    warm: {
      rawV8Milliseconds: rawV8.milliseconds,
      inclusiveV8Milliseconds: v8.milliseconds,
      matchedJavaScriptBoxedLowerBoundMilliseconds: generic.milliseconds,
      sageO0PrefixCount: genericCount,
      sageO0PrefixMilliseconds: sageO0.milliseconds,
      projectedSageO0Milliseconds: sageO0.milliseconds * count / genericCount,
      speedupOverProjectedSageO0:
        (sageO0.milliseconds * count / genericCount) / v8.milliseconds,
    },
    structuralTargetComparison: estimates,
    selected: plan.targetComparison.selected,
    dominanceReason: plan.targetComparison.dominanceReason,
  };
  console.log(JSON.stringify(report, null, 2));

  if (check) {
    assert.equal(plan.targetComparison.selected, "v8-complete-modular-batch");
    assert.equal(estimates.v8.structuralCost.boundaryCrossings.fixed, 0);
    assert.equal(estimates.wasm.structuralCost.boundaryCrossings.fixed, 1);
    assert.equal(estimates.native.structuralCost.boundaryCrossings.fixed, 1);
    assert.equal(estimates.v8.structuralCost.copiedBytes.perElement, 32);
    assert.ok(targetSource.length <= plan.targetCodeBytes);
    assert.ok(v8.milliseconds < 250, `inclusive V8 took ${v8.milliseconds} ms`);
    assert.ok(rawV8.milliseconds < generic.milliseconds);
    assert.ok(report.warm.speedupOverProjectedSageO0 > 10);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});

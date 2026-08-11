#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { compile } = require("@sagemath/sagejs/native");
const flint = require("../packages/flint");
const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");

function positiveNumber(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be positive, got ${value}`);
  }
  return number;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function rationalEntries(size, seed) {
  let state = BigInt(seed) & 0xffffffffn;
  const entries = [];
  for (let index = 0; index < size * size; index += 1) {
    state = (1664525n * state + 1013904223n) & 0xffffffffn;
    const numerator = state % 201n - 100n;
    entries.push([numerator, BigInt(index % 13 + 1)]);
  }
  return entries;
}

function nativeReference(size, seed) {
  const started = performance.now();
  const matrix = flint.qqMatrix(size, size, rationalEntries(size, seed));
  flint.matrixMul(matrix, matrix);
  return performance.now() - started;
}

const cases = [
  { name: "random_1000", expression: "random_matrix(QQ, 1000)", budget: 100 },
  {
    name: "add_1000_resource",
    expression: "_rational_large + _rational_large",
    budget: 150,
  },
  {
    name: "construct_300",
    expression: "matrix(QQ, 300, 300, _rational_budget_values)",
    budget: 180,
  },
  { name: "add_300", expression: "_rational_left + _rational_right", budget: 20 },
  { name: "subtract_300", expression: "_rational_left - _rational_right", budget: 20 },
  { name: "negate_300_steady", expression: "-_rational_left", budget: 15 },
  { name: "scalar_300_steady", expression: "(QQ(17)/19)*_rational_left", budget: 20 },
  { name: "transpose_300", expression: "_rational_left.transpose()", budget: 15 },
  { name: "equal_300_steady", expression: "_rational_left == _rational_equal", budget: 10 },
  { name: "is_zero_300_steady", expression: "_rational_zero.is_zero()", budget: 8 },
  { name: "is_one_300_steady", expression: "_rational_one.is_one()", budget: 8 },
  { name: "copy_300", expression: "_rational_left.__copy__()", budget: 15 },
  { name: "trace_300_steady", expression: "_rational_left.trace()", budget: 8 },
  { name: "rank_300_steady", expression: "_rational_rank.rank()", budget: 2 },
  { name: "density_300", expression: "_rational_left.density()", budget: 8 },
  {
    name: "list_300",
    expression: "_rational_left.list()",
    precheck: ["_rational_left"],
    budget: 175,
  },
  {
    name: "rows_300",
    expression: "_rational_left.rows()",
    precheck: ["_rational_left"],
    budget: 200,
  },
  {
    name: "columns_300",
    expression: "_rational_left.columns()",
    precheck: ["_rational_left"],
    budget: 250,
  },
  {
    name: "select_rows_300",
    expression: "_rational_left.matrix_from_rows(_rational_structural_indices)",
    precheck: ["_rational_left"],
    postcheck: ["_rational_left", "result"],
    budget: 15,
  },
  {
    name: "select_columns_300",
    expression: "_rational_left.matrix_from_columns(_rational_structural_indices)",
    precheck: ["_rational_left"],
    postcheck: ["_rational_left", "result"],
    budget: 15,
  },
  {
    name: "stack_300x300",
    expression: "_rational_left.stack(_rational_right)",
    precheck: ["_rational_left", "_rational_right"],
    postcheck: ["_rational_left", "_rational_right", "result"],
    budget: 15,
  },
  {
    name: "augment_300x300",
    expression: "_rational_left.augment(_rational_right)",
    precheck: ["_rational_left", "_rational_right"],
    postcheck: ["_rational_left", "_rational_right", "result"],
    budget: 15,
  },
  { name: "str_50", expression: "_rational_string.str()", budget: 20 },
  { name: "multiply_80", expression: "_rational_square*_rational_square", budget: 40 },
  { name: "determinant_60", expression: "_rational_det.__copy__().det()", budget: 80 },
  { name: "rank_80", expression: "_rational_square.__copy__().rank()", budget: 35 },
  { name: "rref_60x90", expression: "_rational_wide.__copy__().rref()", budget: 70 },
  { name: "inverse_40", expression: "_rational_inverse.__copy__().inverse()", budget: 80 },
  { name: "solve_40x8", expression: "_rational_inverse.solve_right(_rational_rhs)", budget: 80 },
  { name: "charpoly_35", expression: "_rational_polynomial.__copy__().charpoly()", budget: 80 },
  {
    name: "charpoly_60_resource",
    expression: "_rational_charpoly.__copy__().charpoly()",
    precheck: ["_rational_charpoly"],
    postcheck: ["_rational_charpoly"],
    budget: 20,
  },
  {
    name: "minpoly_25_resource",
    expression: "_rational_minpoly.__copy__().minpoly()",
    precheck: ["_rational_minpoly"],
    postcheck: ["_rational_minpoly"],
    budget: 10,
  },
  {
    name: "right_kernel_60x90",
    expression: "_rational_wide.__copy__().right_kernel_matrix()",
    budget: 35,
  },
  {
    name: "negate_300_cold_resource",
    expression: "-_rational_cold_negate[sample_index]",
    warmExpression: "-_rational_warm",
    precheck: ["_rational_cold_negate[sample_index]"],
    postcheck: ["_rational_cold_negate[sample_index]", "result"],
    budget: 15,
    cold: true,
  },
  {
    name: "scalar_300_cold_resource",
    expression: "(QQ(-17)/19)*_rational_cold_scalar[sample_index]",
    warmExpression: "(QQ(-17)/19)*_rational_warm",
    precheck: ["_rational_cold_scalar[sample_index]"],
    postcheck: ["_rational_cold_scalar[sample_index]", "result"],
    budget: 25,
    cold: true,
  },
  {
    name: "equal_300_cold_resource",
    expression: "_rational_cold_equal_left[sample_index] == _rational_cold_equal_right[sample_index]",
    warmExpression: "_rational_warm == _rational_warm_equal",
    precheck: [
      "_rational_cold_equal_left[sample_index]",
      "_rational_cold_equal_right[sample_index]",
    ],
    postcheck: [
      "_rational_cold_equal_left[sample_index]",
      "_rational_cold_equal_right[sample_index]",
    ],
    budget: 10,
    cold: true,
  },
  {
    name: "unequal_300_cold_resource",
    expression: "_rational_cold_unequal_left[sample_index] != _rational_cold_unequal_right[sample_index]",
    warmExpression: "_rational_warm != _rational_warm_unequal",
    precheck: [
      "_rational_cold_unequal_left[sample_index]",
      "_rational_cold_unequal_right[sample_index]",
    ],
    postcheck: [
      "_rational_cold_unequal_left[sample_index]",
      "_rational_cold_unequal_right[sample_index]",
    ],
    budget: 10,
    cold: true,
  },
  {
    name: "is_zero_300_cold_resource",
    expression: "_rational_cold_zero[sample_index].is_zero()",
    warmExpression: "_rational_warm_zero.is_zero()",
    precheck: ["_rational_cold_zero[sample_index]"],
    postcheck: ["_rational_cold_zero[sample_index]"],
    budget: 8,
    cold: true,
  },
  {
    name: "is_one_300_cold_resource",
    expression: "_rational_cold_one[sample_index].is_one()",
    warmExpression: "_rational_warm_one.is_one()",
    precheck: ["_rational_cold_one[sample_index]"],
    postcheck: ["_rational_cold_one[sample_index]"],
    budget: 8,
    cold: true,
  },
  {
    name: "trace_300_cold_resource",
    expression: "_rational_cold_trace[sample_index].trace()",
    warmExpression: "_rational_warm.trace()",
    precheck: ["_rational_cold_trace[sample_index]"],
    postcheck: ["_rational_cold_trace[sample_index]"],
    budget: 8,
    cold: true,
  },
  {
    name: "rank_300_cold_resource",
    expression: "_rational_cold_rank[sample_index].rank()",
    warmExpression: "_rational_warm_rank.rank()",
    precheck: ["_rational_cold_rank[sample_index]"],
    postcheck: ["_rational_cold_rank[sample_index]"],
    budget: 200,
    cold: true,
  },
];

const structural = [
  "dense_rational_matrix_add",
  "dense_rational_matrix_subtract",
  "dense_rational_matrix_negate",
  "dense_rational_matrix_scalar_multiply",
  "dense_rational_matrix_transpose",
  "dense_rational_matrix_equal",
  "dense_rational_matrix_is_zero",
  "dense_rational_matrix_is_one",
  "dense_rational_matrix_nonzero_count",
  "dense_rational_matrix_trace",
  "dense_rational_matrix_stack",
  "dense_rational_matrix_augment",
  "dense_rational_matrix_select_rows",
  "dense_rational_matrix_select_columns",
  "dense_rational_matrix_fill_denominator_one",
  "dense_rational_matrix_identity",
  "dense_rational_matrix_kernel_from_rref",
];

const advanced = [
  "flint_dense_rational_matrix_mul",
  "flint_dense_rational_matrix_rank",
  "flint_dense_rational_matrix_rref",
  "flint_dense_rational_matrix_inverse",
  "flint_dense_rational_matrix_solve",
  "flint_dense_rational_matrix_determinant",
  "flint_dense_rational_matrix_charpoly",
];

async function run(environment = process.env) {
  const samples = Math.floor(positiveNumber(
    environment.SAGEJS_RATIONAL_MATRIX_SAMPLES,
    "SAGEJS_RATIONAL_MATRIX_SAMPLES",
    5,
  ));
  if (samples < 3) throw new Error("at least three samples are required");
  const budgetScale = positiveNumber(
    environment.SAGEJS_RATIONAL_MATRIX_BUDGET_SCALE,
    "SAGEJS_RATIONAL_MATRIX_BUDGET_SCALE",
    1,
  );
  const hardLimit = positiveNumber(
    environment.SAGEJS_RATIONAL_MATRIX_HARD_LIMIT_MS,
    "SAGEJS_RATIONAL_MATRIX_HARD_LIMIT_MS",
    750,
  );
  const cache = mkdtempSync(join(tmpdir(), "sagejs-rational-matrix-budget-"));
  const savedCache = process.env.SAGEJS_NATIVE_CACHE_DIR;
  const savedRequired = process.env.SAGEJS_NATIVE_REQUIRED;
  try {
    for (const filename of [
      "dense_integer.py",
      "dense_rational.py",
      "dense_rational_flint.py",
    ]) {
      await compile({
        sourcePath: join(
          root, "src", "lib", "sagejs", "kernels", "matrix", filename,
        ),
        cacheRoot: cache,
      });
    }
    process.env.SAGEJS_NATIVE_CACHE_DIR = cache;
    process.env.SAGEJS_NATIVE_REQUIRED = "1";

    nativeReference(80, 1);
    const reference = Array.from(
      { length: samples }, (_, index) => nativeReference(80, index + 2),
    );
    const referenceMedian = median(reference);
    const loadFactor = Math.max(1, referenceMedian / 4);

    const session = await createSage();
    const results = [];
    try {
      const witnesses = await session.evaluate([
        `from sagejs.kernels.matrix.dense_rational import ${structural.join(", ")}`,
        `from sagejs.kernels.matrix.dense_rational_flint import ${advanced.join(", ")}`,
        ...[...structural, ...advanced].map((name) =>
          `print(${name}.nativeAvailable)`
        ),
      ].join("\n"));
      const expected = [...structural, ...advanced].map(() => "True").join("\n");
      if (witnesses.stdout.trim() !== expected) {
        throw new Error("rational matrix gate did not resolve isolated kernels");
      }

      const definitions = cases.flatMap((testCase) => [
        `def _rational_surface_${testCase.name}(sample_index=0):`,
        ...(testCase.precheck || []).map((value) =>
          `    _rational_assert_resource_direct(${value})`
        ),
        "    started = _rational_budget_runtime.wall_time()",
        `    result = ${testCase.expression}`,
        "    elapsed = (_rational_budget_runtime.wall_time() - started) * 1000",
        "    if result is None:",
        "        raise RuntimeError('rational matrix operation returned None')",
        ...(testCase.postcheck || []).map((value) =>
          `    _rational_assert_resource_direct(${value})`
        ),
        "    return elapsed",
      ]);
      await session.evaluate([
        "import sagejs.runtime as _rational_budget_runtime",
        "def _rational_assert_resource_direct(value):",
        "    storage = value._rational_storage_cache",
        "    if _rational_budget_runtime.reflect.get(storage, 'numerators') is not _rational_budget_runtime.undefined:",
        "        raise RuntimeError('rational resource materialized numerator compatibility storage')",
        "    if _rational_budget_runtime.reflect.get(storage, 'denominators') is not _rational_budget_runtime.undefined:",
        "        raise RuntimeError('rational resource materialized denominator compatibility storage')",
        "set_random_seed(20260810)",
        "_rational_budget_values = [QQ(index % 201 - 100)/(index % 13 + 1) for index in range(300*300)]",
        "_rational_large = random_matrix(QQ, 1000)",
        "_rational_left = random_matrix(QQ, 300) / 7",
        "_rational_right = random_matrix(QQ, 300) / 11",
        "_rational_equal = _rational_left.__copy__()",
        "_rational_zero = zero_matrix(QQ, 300)",
        "_rational_one = identity_matrix(QQ, 300)",
        "_rational_rank = identity_matrix(QQ, 300)",
        "_rational_structural_indices = [(37*index) % 300 for index in range(300)]",
        "_rational_string = random_matrix(QQ, 50)",
        "_rational_square = random_matrix(QQ, 80) / 7",
        "_rational_det = random_matrix(QQ, 60) / 11",
        "_rational_wide = random_matrix(QQ, 60, 90) / 13",
        "_rational_inverse = random_matrix(QQ, 40) + identity_matrix(QQ, 40)",
        "_rational_rhs = random_matrix(QQ, 40, 8) / 17",
        "_rational_polynomial = random_matrix(QQ, 35) / 19",
        "_rational_charpoly = random_matrix(QQ, 60)",
        "_rational_minpoly = matrix(QQ, 25, 25, [QQ(((17*r + 31*c + 7*r*c + 11) % 101) - 50, (r + 2*c) % 13 + 1) for r in range(25) for c in range(25)])",
        "_rational_warm = random_matrix(QQ, 300)",
        "_rational_warm_equal = _rational_warm.__copy__()",
        "_rational_warm_unequal = _rational_warm + identity_matrix(QQ, 300)",
        "_rational_warm_zero = zero_matrix(QQ, 300)",
        "_rational_warm_one = identity_matrix(QQ, 300)",
        "_rational_warm_rank = identity_matrix(QQ, 300)",
        `_rational_cold_negate = [random_matrix(QQ, 300) for _index in range(${samples})]`,
        `_rational_cold_scalar = [random_matrix(QQ, 300) for _index in range(${samples})]`,
        `_rational_cold_equal_left = [random_matrix(QQ, 300) for _index in range(${samples})]`,
        "_rational_cold_equal_right = [value.__copy__() for value in _rational_cold_equal_left]",
        `_rational_cold_unequal_left = [random_matrix(QQ, 300) for _index in range(${samples})]`,
        "_rational_cold_unequal_right = [value + identity_matrix(QQ, 300) for value in _rational_cold_unequal_left]",
        `_rational_cold_zero = [zero_matrix(QQ, 300) for _index in range(${samples})]`,
        `_rational_cold_one = [identity_matrix(QQ, 300) for _index in range(${samples})]`,
        `_rational_cold_trace = [random_matrix(QQ, 300) for _index in range(${samples})]`,
        `_rational_cold_rank = [identity_matrix(QQ, 300) for _index in range(${samples})]`,
        ...definitions,
      ].join("\n"));

      for (const testCase of cases) {
        if (testCase.cold) {
          await session.evaluate(`_rational_warm_result = ${testCase.warmExpression}`);
        } else {
          await session.evaluate(`_rational_surface_${testCase.name}()`);
        }
        const times = [];
        for (let index = 0; index < samples; index += 1) {
          const sample = await session.evaluate(
            `_rational_surface_${testCase.name}(${testCase.cold ? index : 0})`,
          );
          const elapsed = Number(sample.repr);
          if (!Number.isFinite(elapsed) || elapsed <= 0) {
            throw new Error(`invalid ${testCase.name} timing: ${sample.repr}`);
          }
          times.push(elapsed);
        }
        const raw = median(times);
        results.push({
          ...testCase,
          raw,
          normalized: raw / loadFactor,
          scaledBudget: testCase.budget * budgetScale,
        });
      }
    } finally {
      session.close();
    }

    console.log(`Dense QQ matrix budget (${samples} samples per case)`);
    console.log("  implementation: typed-python + generated FLINT resources");
    console.log("  warmup: sacrificial operands; cold-resource inputs are preconstructed and unmaterialized");
    console.log(`  raw FLINT construction+multiply median: ${referenceMedian.toFixed(2)} ms`);
    console.log(`  measured load factor: ${loadFactor.toFixed(2)}x`);
    console.log("  operation                         raw / normalized / budget");
    const failures = [];
    for (const result of results) {
      console.log(
        `  ${result.name.padEnd(28)} ` +
        `${result.raw.toFixed(2).padStart(7)} / ` +
        `${result.normalized.toFixed(2).padStart(7)} / ` +
        `${result.scaledBudget.toFixed(2).padStart(7)} ms`,
      );
      if (result.normalized > result.scaledBudget || result.raw > hardLimit) {
        failures.push(result.name);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `dense QQ public-surface performance regression: ${failures.join(", ")}`,
      );
    }
  } finally {
    if (savedCache === undefined) delete process.env.SAGEJS_NATIVE_CACHE_DIR;
    else process.env.SAGEJS_NATIVE_CACHE_DIR = savedCache;
    if (savedRequired === undefined) delete process.env.SAGEJS_NATIVE_REQUIRED;
    else process.env.SAGEJS_NATIVE_REQUIRED = savedRequired;
    rmSync(cache, { recursive: true, force: true });
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { cases, median, nativeReference, rationalEntries, run };

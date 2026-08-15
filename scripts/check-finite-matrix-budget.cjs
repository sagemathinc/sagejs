#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

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

function range(values) {
  return {
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values),
  };
}

function formatRange(values) {
  const summary = range(values);
  return `${summary.minimum.toFixed(1)} / ${summary.median.toFixed(1)} / ` +
    `${summary.maximum.toFixed(1)} ms`;
}

function nativeSample(seed) {
  const started = performance.now();
  const matrix = flint.nmodMatrixRandom(
    300, 300, 7n, BigInt(seed), 314159265n,
  );
  flint.matrixMul(matrix, matrix);
  return performance.now() - started;
}

const surfaceCases = [
  { name: "random_500", expression: "random_matrix(GF(97), 500)", budget: 8 },
  {
    name: "construct_500",
    expression: "matrix(GF(97), 500, 500, _matrix_budget_values)",
    budget: 8,
  },
  { name: "add_500", expression: "_matrix_budget_left + _matrix_budget_right", budget: 8 },
  { name: "subtract_500", expression: "_matrix_budget_left - _matrix_budget_right", budget: 8 },
  { name: "negate_500", expression: "-_matrix_budget_left", budget: 8 },
  { name: "scalar_500", expression: "13 * _matrix_budget_left", budget: 8 },
  { name: "transpose_500", expression: "_matrix_budget_left.transpose()", budget: 8 },
  { name: "equal_500", expression: "_matrix_budget_left == _matrix_budget_equal", budget: 5 },
  { name: "copy_500", expression: "_matrix_budget_left.__copy__()", budget: 8 },
  { name: "is_zero_500", expression: "_matrix_budget_zero.is_zero()", budget: 5 },
  { name: "is_one_500", expression: "_matrix_budget_one.is_one()", budget: 5 },
  { name: "trace_500", expression: "_matrix_budget_left.trace()", budget: 5 },
  { name: "density_500", expression: "_matrix_budget_left.density()", budget: 5 },
  { name: "stack_500", expression: "_matrix_budget_top.stack(_matrix_budget_bottom)", budget: 8 },
  { name: "augment_500", expression: "_matrix_budget_al.augment(_matrix_budget_ar)", budget: 8 },
  {
    name: "select_rows_250x500",
    expression: "_matrix_budget_left.matrix_from_rows(_matrix_budget_indices)",
    budget: 8,
  },
  {
    name: "select_columns_500x250",
    expression: "_matrix_budget_left.matrix_from_columns(_matrix_budget_indices)",
    budget: 8,
  },
  { name: "determinant_200", expression: "_matrix_budget_square.__copy__().det()", budget: 10 },
  { name: "charpoly_80", expression: "_matrix_budget_polynomial.__copy__().charpoly()", budget: 15 },
  { name: "minpoly_80", expression: "_matrix_budget_polynomial.__copy__().minpoly()", budget: 15 },
  { name: "multiply_300", expression: "_matrix_budget_multiply * _matrix_budget_multiply", budget: 15 },
  { name: "rank_200", expression: "_matrix_budget_square.__copy__().rank()", budget: 10 },
  { name: "rref_200", expression: "_matrix_budget_square.__copy__().rref()", budget: 10 },
  {
    name: "right_kernel_150x200",
    expression: "_matrix_budget_wide.__copy__().right_kernel_matrix()",
    budget: 15,
  },
  { name: "inverse_100", expression: "_matrix_budget_solve_left.__copy__().inverse()", budget: 10 },
  {
    name: "solve_100x8",
    expression: "_matrix_budget_solve_left.__copy__().solve_right(_matrix_budget_solve_right)",
    budget: 10,
  },
  { name: "determinant_500", expression: "_matrix_budget_left.__copy__().det()", budget: 40 },
  { name: "multiply_500", expression: "_matrix_budget_multiply_large * _matrix_budget_multiply_large", budget: 25 },
  { name: "rank_500", expression: "_matrix_budget_left.__copy__().rank()", budget: 40 },
  { name: "rref_500", expression: "_matrix_budget_left.__copy__().rref()", budget: 45 },
  {
    name: "right_kernel_300x400",
    expression: "_matrix_budget_wide_large.__copy__().right_kernel_matrix()",
    budget: 45,
  },
];

const typedWitnesses = [
  "dense_prime_field_matrix_add",
  "dense_prime_field_matrix_subtract",
  "dense_prime_field_matrix_negate",
  "dense_prime_field_matrix_scalar_multiply",
  "dense_prime_field_matrix_transpose",
  "dense_prime_field_matrix_equal",
  "dense_prime_field_matrix_is_zero",
  "dense_prime_field_matrix_is_one",
  "dense_prime_field_matrix_nonzero_count",
  "dense_prime_field_matrix_trace",
  "dense_prime_field_matrix_stack",
  "dense_prime_field_matrix_augment",
  "dense_prime_field_matrix_select_rows",
  "dense_prime_field_matrix_select_columns",
  "dense_prime_field_matrix_random_fill",
];

const ffiWitnesses = [
  "flint_dense_prime_field_matrix_mul",
  "flint_dense_prime_field_matrix_rank",
  "flint_dense_prime_field_matrix_rref",
  "flint_dense_prime_field_matrix_right_kernel",
  "flint_dense_prime_field_matrix_determinant",
  "flint_dense_prime_field_matrix_charpoly",
  "flint_dense_prime_field_matrix_minpoly",
  "flint_dense_prime_field_matrix_inverse",
  "flint_dense_prime_field_matrix_solve",
];

async function run(environment = process.env) {
  if (!flint.blasEnabled()) {
    throw new Error("native FLINT was built without CBLAS acceleration");
  }
  const samples = Math.floor(positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_SAMPLES,
    "SAGEJS_FINITE_MATRIX_SAMPLES",
    7,
  ));
  if (samples < 3) throw new Error("at least three samples are required");
  const budgetMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_BUDGET_MS,
    "SAGEJS_FINITE_MATRIX_BUDGET_MS",
    50,
  );
  const referenceNativeMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_REFERENCE_MS,
    "SAGEJS_FINITE_MATRIX_REFERENCE_MS",
    4,
  );
  const hardLimitMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_HARD_LIMIT_MS,
    "SAGEJS_FINITE_MATRIX_HARD_LIMIT_MS",
    300,
  );
  const surfaceBudgetScale = positiveNumber(
    environment.SAGEJS_DENSE_MATRIX_BUDGET_SCALE,
    "SAGEJS_DENSE_MATRIX_BUDGET_SCALE",
    1,
  );

  const nativeCache = mkdtempSync(join(tmpdir(), "sagejs-matrix-budget-"));
  const savedNativeCache = process.env.SAGEJS_NATIVE_CACHE_DIR;
  const savedNativeRequired = process.env.SAGEJS_NATIVE_REQUIRED;
  try {
    for (const sourcePath of [
      join(root, "src", "lib", "sagejs", "kernels", "matrix",
        "dense_prime_field.py"),
      join(root, "src", "lib", "sagejs", "kernels", "matrix",
        "dense_prime_field_flint.py"),
    ]) {
      await compile({ sourcePath, cacheRoot: nativeCache });
    }
    process.env.SAGEJS_NATIVE_CACHE_DIR = nativeCache;
    process.env.SAGEJS_NATIVE_REQUIRED = "1";

    nativeSample(1);
    const nativeTimes = Array.from(
      { length: samples }, (_, index) => nativeSample(index + 2));
    const nativeMedianMs = median(nativeTimes);
    const loadFactor = Math.max(1, nativeMedianMs / referenceNativeMs);

    const session = await createSage();
    const targetTimes = [];
    const requestTimes = [];
    const surfaceResults = [];
    try {
      const tiers = await session.evaluate([
        `from sagejs.kernels.matrix.dense_prime_field import ${typedWitnesses.join(", ")}`,
        `from sagejs.kernels.matrix.dense_prime_field_flint import ${ffiWitnesses.join(", ")}`,
        ...typedWitnesses.map((name) => `print(${name}.nativeAvailable)`),
        ...ffiWitnesses.map((name) => `print(${name}.nativeAvailable)`),
      ].join("\n"));
      const expectedTiers = [...typedWitnesses, ...ffiWitnesses]
        .map(() => "True").join("\n");
      if (tiers.stdout.trim() !== expectedTiers) {
        throw new Error(
          `matrix surface gate did not resolve every isolated kernel: ` +
          JSON.stringify(tiers.stdout.trim()),
        );
      }
      await session.evaluate([
        "import sagejs.runtime as _matrix_budget_runtime",
        "def _matrix_budget_sample():",
        "    started = _matrix_budget_runtime.wall_time()",
        "    result = random_matrix(GF(7), 300)^2",
        "    return (_matrix_budget_runtime.wall_time() - started) * 1000",
      ].join("\n"));
      await session.evaluate("_matrix_budget_sample()");
      for (let index = 0; index < samples; index += 1) {
        const started = performance.now();
        const result = await session.evaluate("_matrix_budget_sample()");
        requestTimes.push(performance.now() - started);
        const elapsed = Number(result.repr);
        if (!Number.isFinite(elapsed) || elapsed <= 0) {
          throw new Error(`unexpected internal timing: ${result.repr}`);
        }
        targetTimes.push(elapsed);
      }

      const functionDefinitions = surfaceCases.flatMap((testCase) => [
        `def _matrix_surface_${testCase.name}():`,
        "    started = _matrix_budget_runtime.wall_time()",
        `    result = ${testCase.expression}`,
        "    if result is None:",
        "        raise RuntimeError('matrix surface operation returned None')",
        "    return (_matrix_budget_runtime.wall_time() - started) * 1000",
      ]);
      await session.evaluate([
        "import sagejs.runtime as _matrix_budget_runtime",
        "set_random_seed(20260810)",
        "_matrix_budget_values = [index % 97 for index in range(500 * 500)]",
        "_matrix_budget_left = random_matrix(GF(97), 500)",
        "_matrix_budget_right = random_matrix(GF(97), 500)",
        "_matrix_budget_equal = _matrix_budget_left.__copy__()",
        "_matrix_budget_zero = zero_matrix(GF(97), 500)",
        "_matrix_budget_one = identity_matrix(GF(97), 500)",
        "_matrix_budget_top = random_matrix(GF(97), 250, 500)",
        "_matrix_budget_bottom = random_matrix(GF(97), 250, 500)",
        "_matrix_budget_al = random_matrix(GF(97), 500, 250)",
        "_matrix_budget_ar = random_matrix(GF(97), 500, 250)",
        "_matrix_budget_indices = list(range(0, 500, 2))",
        "_matrix_budget_square = random_matrix(GF(97), 200)",
        "_matrix_budget_polynomial = random_matrix(GF(97), 80)",
        "_matrix_budget_multiply = random_matrix(GF(7), 300)",
        "_matrix_budget_multiply_large = random_matrix(GF(7), 500)",
        "_matrix_budget_wide = random_matrix(GF(97), 150, 200)",
        "_matrix_budget_wide_large = random_matrix(GF(97), 300, 400)",
        "_matrix_budget_solve_left = random_matrix(GF(97), 100)",
        "_matrix_budget_solve_right = random_matrix(GF(97), 100, 8)",
        ...functionDefinitions,
      ].join("\n"));
      for (const testCase of surfaceCases) {
        await session.evaluate(`_matrix_surface_${testCase.name}()`);
        const times = [];
        for (let index = 0; index < samples; index += 1) {
          const result = await session.evaluate(
            `_matrix_surface_${testCase.name}()`,
          );
          const elapsed = Number(result.repr);
          if (!Number.isFinite(elapsed) || elapsed <= 0) {
            throw new Error(
              `unexpected ${testCase.name} timing: ${result.repr}`,
            );
          }
          times.push(elapsed);
        }
        const rawMedianMs = median(times);
        surfaceResults.push({
          ...testCase,
          times,
          rawMedianMs,
          normalizedMs: rawMedianMs / loadFactor,
          scaledBudgetMs: testCase.budget * surfaceBudgetScale,
        });
      }
    } finally {
      await session.close();
    }

    const targetMedianMs = median(targetTimes);
    const normalizedMs = targetMedianMs / loadFactor;
    console.log(`Finite-field matrix budget (${samples} warm samples)`);
    console.log("  implementations:        typed-python-isolated + declared-flint-isolated");
    console.log(`  samples:                 min / median / max`);
    console.log(`  native random + square: ${formatRange(nativeTimes)}`);
    console.log(`  Sage.js expression:     ${formatRange(targetTimes)}`);
    console.log(`  full session request:   ${formatRange(requestTimes)}`);
    console.log(`  measured load factor:   ${loadFactor.toFixed(2)}x`);
    console.log(`  normalized expression:  ${normalizedMs.toFixed(1)} ms`);
    console.log(`  normalized budget:      ${budgetMs.toFixed(1)} ms`);
    console.log(`  catastrophic ceiling:   ${hardLimitMs.toFixed(1)} ms raw`);
    if (normalizedMs > budgetMs || targetMedianMs > hardLimitMs) {
      throw new Error(
        "finite-field random_matrix(GF(7),300)^2 performance regression",
      );
    }
    console.log("\nDense GF(p) public surface (raw median / normalized / budget)");
    const failures = [];
    for (const result of surfaceResults) {
      console.log(
        `  ${result.name.padEnd(28)} ` +
        `${result.rawMedianMs.toFixed(2).padStart(7)} / ` +
        `${result.normalizedMs.toFixed(2).padStart(7)} / ` +
        `${result.scaledBudgetMs.toFixed(2).padStart(7)} ms`,
      );
      if (
        result.normalizedMs > result.scaledBudgetMs ||
        result.rawMedianMs > hardLimitMs
      ) {
        failures.push(result.name);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `dense GF(p) public-surface performance regression: ` +
        failures.join(", "),
      );
    }
  } finally {
    if (savedNativeCache === undefined) {
      delete process.env.SAGEJS_NATIVE_CACHE_DIR;
    } else {
      process.env.SAGEJS_NATIVE_CACHE_DIR = savedNativeCache;
    }
    if (savedNativeRequired === undefined) {
      delete process.env.SAGEJS_NATIVE_REQUIRED;
    } else {
      process.env.SAGEJS_NATIVE_REQUIRED = savedNativeRequired;
    }
    rmSync(nativeCache, { recursive: true, force: true });
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  formatRange,
  median,
  nativeSample,
  positiveNumber,
  range,
  run,
  surfaceCases,
};

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

function exactEntries(size, seed) {
  let state = BigInt(seed) & 0xffffffffn;
  const entries = [];
  for (let index = 0; index < size * size; index += 1) {
    state = (1664525n * state + 1013904223n) & 0xffffffffn;
    entries.push(state % 201n - 100n);
  }
  return entries;
}

function nativeReference(size, seed) {
  const started = performance.now();
  const matrix = flint.zzMatrix(size, size, exactEntries(size, seed));
  flint.matrixMul(matrix, matrix);
  return performance.now() - started;
}

const cases = [
  { name: "random_500", expression: "random_matrix(ZZ, 500)", budget: 15 },
  {
    name: "construct_500",
    expression: "matrix(ZZ, 500, 500, _integer_budget_values)",
    budget: 50,
  },
  { name: "add_500", expression: "_integer_left + _integer_right", budget: 12 },
  { name: "subtract_500", expression: "_integer_left - _integer_right", budget: 12 },
  { name: "negate_500", expression: "-_integer_left", budget: 10 },
  { name: "scalar_500", expression: "17*_integer_left", budget: 15 },
  { name: "transpose_500", expression: "_integer_left.transpose()", budget: 12 },
  { name: "equal_500", expression: "_integer_left == _integer_equal", budget: 8 },
  { name: "copy_500", expression: "_integer_left.__copy__()", budget: 12 },
  { name: "trace_500", expression: "_integer_left.trace()", budget: 6 },
  { name: "density_500", expression: "_integer_left.density()", budget: 8 },
  { name: "multiply_150", expression: "_integer_square*_integer_square", budget: 30 },
  {
    name: "determinant_150",
    expression: "_integer_square.__copy__().det()",
    budget: 40,
  },
  { name: "rank_150", expression: "_integer_square.__copy__().rank()", budget: 30 },
  {
    name: "charpoly_60",
    expression: "_integer_polynomial.__copy__().charpoly()",
    budget: 30,
  },
  {
    name: "hnf_35",
    expression: "_integer_normal.__copy__().hermite_form()",
    budget: 50,
  },
  {
    name: "smith_25",
    expression: "_integer_smith.__copy__().smith_form()",
    budget: 50,
  },
  {
    name: "right_kernel_40x60",
    expression: "_integer_wide.__copy__().right_kernel_matrix()",
    budget: 50,
  },
];

const structural = [
  "dense_integer_add",
  "dense_integer_subtract",
  "dense_integer_negate",
  "dense_integer_scalar_multiply",
  "dense_integer_transpose",
  "dense_integer_equal",
  "dense_integer_is_zero",
  "dense_integer_is_one",
  "dense_integer_nonzero_count",
  "dense_integer_trace",
  "dense_integer_stack",
  "dense_integer_augment",
  "dense_integer_select_rows",
  "dense_integer_select_columns",
  "dense_integer_random_fill",
  "dense_integer_random_fill_default",
];

const advanced = [
  "flint_dense_integer_mul",
  "flint_dense_integer_determinant",
  "flint_dense_integer_charpoly",
  "flint_dense_integer_rank",
  "flint_dense_integer_hnf",
  "flint_dense_integer_hnf_transform",
  "flint_dense_integer_snf_transform",
  "flint_dense_integer_right_kernel",
];

async function run(environment = process.env) {
  const samples = Math.floor(positiveNumber(
    environment.SAGEJS_INTEGER_MATRIX_SAMPLES,
    "SAGEJS_INTEGER_MATRIX_SAMPLES",
    5,
  ));
  if (samples < 3) throw new Error("at least three samples are required");
  const budgetScale = positiveNumber(
    environment.SAGEJS_INTEGER_MATRIX_BUDGET_SCALE,
    "SAGEJS_INTEGER_MATRIX_BUDGET_SCALE",
    1,
  );
  const hardLimit = positiveNumber(
    environment.SAGEJS_INTEGER_MATRIX_HARD_LIMIT_MS,
    "SAGEJS_INTEGER_MATRIX_HARD_LIMIT_MS",
    500,
  );
  const cache = mkdtempSync(join(tmpdir(), "sagejs-integer-matrix-budget-"));
  const savedCache = process.env.SAGEJS_NATIVE_CACHE_DIR;
  const savedRequired = process.env.SAGEJS_NATIVE_REQUIRED;
  try {
    for (const filename of ["dense_integer.py", "dense_integer_flint.py"]) {
      await compile({
        sourcePath: join(root, "src", "lib", "sagejs", "kernels", filename),
        cacheRoot: cache,
      });
    }
    process.env.SAGEJS_NATIVE_CACHE_DIR = cache;
    process.env.SAGEJS_NATIVE_REQUIRED = "1";

    nativeReference(150, 1);
    const reference = Array.from(
      { length: samples }, (_, index) => nativeReference(150, index + 2),
    );
    const referenceMedian = median(reference);
    const loadFactor = Math.max(1, referenceMedian / 12);

    const session = await createSage();
    const results = [];
    try {
      const witnesses = await session.evaluate([
        `from sagejs.kernels.dense_integer import ${structural.join(", ")}`,
        `from sagejs.kernels.dense_integer_flint import ${advanced.join(", ")}`,
        ...[...structural, ...advanced].map((name) =>
          `print(${name}.nativeAvailable)`
        ),
      ].join("\n"));
      const expected = [...structural, ...advanced].map(() => "True").join("\n");
      if (witnesses.stdout.trim() !== expected) {
        throw new Error("integer matrix gate did not resolve isolated kernels");
      }

      const definitions = cases.flatMap((testCase) => [
        `def _integer_surface_${testCase.name}():`,
        "    started = _integer_budget_runtime.wall_time()",
        `    result = ${testCase.expression}`,
        "    if result is None:",
        "        raise RuntimeError('integer matrix operation returned None')",
        "    return (_integer_budget_runtime.wall_time() - started) * 1000",
      ]);
      await session.evaluate([
        "import sagejs.runtime as _integer_budget_runtime",
        "set_random_seed(20260810)",
        "_integer_budget_values = [index % 201 - 100 for index in range(500*500)]",
        "_integer_left = random_matrix(ZZ, 500, x=-100, y=101)",
        "_integer_right = random_matrix(ZZ, 500, x=-100, y=101)",
        "_integer_equal = _integer_left.__copy__()",
        "_integer_square = random_matrix(ZZ, 150, x=-10, y=11)",
        "_integer_polynomial = random_matrix(ZZ, 60, x=-10, y=11)",
        "_integer_normal = random_matrix(ZZ, 35, x=-10, y=11)",
        "_integer_smith = random_matrix(ZZ, 25, x=-10, y=11)",
        "_integer_wide = random_matrix(ZZ, 40, 60, x=-10, y=11)",
        ...definitions,
      ].join("\n"));

      for (const testCase of cases) {
        await session.evaluate(`_integer_surface_${testCase.name}()`);
        const times = [];
        for (let index = 0; index < samples; index += 1) {
          const sample = await session.evaluate(
            `_integer_surface_${testCase.name}()`,
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

    console.log(`Dense ZZ matrix budget (${samples} warm samples)`);
    console.log("  implementation: typed-python-isolated + declared-flint-isolated");
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
        `dense ZZ public-surface performance regression: ${failures.join(", ")}`,
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

module.exports = { cases, exactEntries, median, nativeReference, run };

#!/usr/bin/env node

"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { compile } = require("@sagemath/sagejs/native");
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

const cases = [
  { name: "construct_ZZ_1000", expression: "Rz(_zz_values)", budget: 20 },
  { name: "construct_QQ_500", expression: "Rq(_qq_values)", budget: 25 },
  { name: "construct_GF_2000", expression: "Rf(_gf_values)", budget: 20 },
  { name: "multiply_ZZ_256", expression: "fz * gz", budget: 15 },
  { name: "multiply_QQ_128", expression: "fq * gq", budget: 20 },
  { name: "multiply_GF_512", expression: "fp * gp", budget: 12 },
  {
    name: "evaluate_GF_20000",
    expression: "_gf_serialization_value(_gf_evaluation_point)",
    budget: 5,
  },
  {
    name: "sagepack_dump_GF_20000",
    expression: "_serialization_dumps(_gf_serialization_value)",
    budget: 100,
  },
  {
    name: "sagepack_load_GF_20000",
    expression: "_serialization_loads(_gf_serialization_data)",
    budget: 100,
  },
  {
    name: "divexact_ZZ_80",
    expression: "exact_z // (xz - 1)**20",
    budget: 20,
  },
  {
    name: "factor_QQ_60",
    expression: "exact_q.factor()",
    budget: 50,
  },
  {
    name: "factor_roots_GF_60",
    expression: "(exact_f.factor(), exact_f.roots())",
    budget: 50,
  },
];

async function run(environment = process.env) {
  const samples = Math.floor(positiveNumber(
    environment.SAGEJS_POLYNOMIAL_SAMPLES,
    "SAGEJS_POLYNOMIAL_SAMPLES",
    5,
  ));
  if (samples < 3) throw new Error("at least three samples are required");
  const budgetScale = positiveNumber(
    environment.SAGEJS_POLYNOMIAL_BUDGET_SCALE,
    "SAGEJS_POLYNOMIAL_BUDGET_SCALE",
    1,
  );
  const hardLimit = positiveNumber(
    environment.SAGEJS_POLYNOMIAL_HARD_LIMIT_MS,
    "SAGEJS_POLYNOMIAL_HARD_LIMIT_MS",
    500,
  );
  const cache = mkdtempSync(join(tmpdir(), "sagejs-polynomial-budget-"));
  const saved = {
    cache: process.env.SAGEJS_NATIVE_CACHE_DIR,
    required: process.env.SAGEJS_NATIVE_REQUIRED,
    forbidden: process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI,
  };
  try {
    for (const filename of [
      "packed_integer.py",
      "packed_rational.py",
      "packed_prime_field.py",
      "packed_flint.py",
    ]) {
      await compile({
        sourcePath: join(
          root,
          "src",
          "lib",
          "sagejs",
          "kernels",
          "polynomial",
          filename,
        ),
        cacheRoot: cache,
      });
    }
    process.env.SAGEJS_NATIVE_CACHE_DIR = cache;
    process.env.SAGEJS_NATIVE_REQUIRED = "1";
    process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI = "1";

    const session = await createSage();
    const results = [];
    try {
      const definitions = cases.flatMap((testCase) => [
        `def _polynomial_surface_${testCase.name}():`,
        "    started = _polynomial_budget_runtime.wall_time()",
        `    result = ${testCase.expression}`,
        "    if result is None:",
        "        raise RuntimeError('polynomial operation returned None')",
        "    return (_polynomial_budget_runtime.wall_time() - started) * 1000",
      ]);
      const setup = await session.evaluate([
        "import sagejs.runtime as _polynomial_budget_runtime",
        "from sagejs_serialization import dumps as _serialization_dumps, loads as _serialization_loads",
        "Rz = PolynomialRing(ZZ, 'xz'); xz = Rz.gen()",
        "Rq = PolynomialRing(QQ, 'xq'); xq = Rq.gen()",
        "Rf = PolynomialRing(GF(65521), 'xf'); xf = Rf.gen()",
        "_zz_values = [index % 17 - 8 for index in range(1000)]",
        "_qq_values = [QQ(index % 17 - 8)/(index % 7 + 1) for index in range(500)]",
        "_gf_values = [index * 37 + 11 for index in range(2000)]",
        "fz = Rz(_zz_values[:256]); gz = Rz(_zz_values[31:287])",
        "fq = Rq(_qq_values[:128]); gq = Rq(_qq_values[17:145])",
        "fp = Rf(_gf_values[:512]); gp = Rf(_gf_values[29:541])",
        "_gf_serialization_value = Rf([(index*37 + 11) % 65521 for index in range(20000)])",
        "_gf_evaluation_point = Rf.base_ring()(12345)",
        "_gf_serialization_data = _serialization_dumps(_gf_serialization_value)",
        "exact_z = (xz - 1)**20 * (xz + 2)**60",
        "exact_q = (QQ(3)/10) * (xq - 1)**40 * (xq + 2)**20",
        "exact_f = (xf - 1)**40 * (xf + 2)**20",
        ...definitions,
      ].join("\n"));
      if (setup.stderr !== undefined) throw new Error(setup.stderr);

      for (const testCase of cases) {
        await session.evaluate(`_polynomial_surface_${testCase.name}()`);
        const times = [];
        for (let index = 0; index < samples; index += 1) {
          const sample = await session.evaluate(
            `_polynomial_surface_${testCase.name}()`,
          );
          const elapsed = Number(sample.repr);
          if (!Number.isFinite(elapsed) || elapsed < 0) {
            throw new Error(`invalid ${testCase.name} timing: ${sample.repr}`);
          }
          times.push(elapsed);
        }
        results.push({
          ...testCase,
          median: median(times),
          scaledBudget: testCase.budget * budgetScale,
        });
      }
    } finally {
      session.close();
    }

    console.log(`Packed polynomial budget (${samples} warm samples)`);
    console.log("  implementation: typed-python-isolated + declared-flint-isolated");
    console.log("  legacy univariate polynomial N-API: forbidden");
    console.log("  operation                         median / budget");
    const failures = [];
    for (const result of results) {
      console.log(
        `  ${result.name.padEnd(30)} ` +
        `${result.median.toFixed(2).padStart(7)} / ` +
        `${result.scaledBudget.toFixed(2).padStart(7)} ms`,
      );
      if (result.median > result.scaledBudget || result.median > hardLimit) {
        failures.push(result.name);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `packed polynomial performance regression: ${failures.join(", ")}`,
      );
    }
  } finally {
    for (const [name, value] of [
      ["SAGEJS_NATIVE_CACHE_DIR", saved.cache],
      ["SAGEJS_NATIVE_REQUIRED", saved.required],
      ["SAGEJS_FORBID_POLYNOMIAL_NAPI", saved.forbidden],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(cache, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

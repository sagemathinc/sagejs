#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");

const ratchetPath = join(__dirname, "linear-algebra-api-ratchets.json");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function positiveInteger(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}`);
  }
  return parsed;
}

function positiveNumber(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be positive, got ${value}`);
  }
  return parsed;
}

function loadRatchets() {
  return JSON.parse(readFileSync(ratchetPath, "utf8"));
}

function validateRatchets(ratchets) {
  if (ratchets.schema_version !== 1) {
    throw new Error(`unsupported ratchet schema ${ratchets.schema_version}`);
  }
  const ids = new Set();
  const coverage = new Set();
  const allowedPaths = new Set([
    "generated-owned-resource",
    "packed-compiler-owned",
    "generated-packed-ffi",
    "dynamic-python",
  ]);
  for (const testCase of ratchets.cases) {
    if (ids.has(testCase.id)) throw new Error(`duplicate case ${testCase.id}`);
    ids.add(testCase.id);
    coverage.add(`${testCase.object}:${testCase.base_ring}`);
    if (!allowedPaths.has(testCase.path)) {
      throw new Error(`${testCase.id} has invalid path ${testCase.path}`);
    }
    if (!Number.isInteger(testCase.iterations) || testCase.iterations <= 0) {
      throw new Error(`${testCase.id} has invalid iterations`);
    }
    if (!Number.isFinite(testCase.budget_ms) || testCase.budget_ms <= 0) {
      throw new Error(`${testCase.id} has invalid budget`);
    }
  }
  for (const ring of ["ZZ", "QQ", "GF(7)"]) {
    for (const object of ["Matrix", "Vector"]) {
      if (!coverage.has(`${object}:${ring}`)) {
        throw new Error(`missing ${object} benchmark coverage over ${ring}`);
      }
    }
  }
  return ratchets;
}

const setup = String.raw`
_audit_zz_values = [((index*17 + 3) % 101) - 50 for index in range(80*80)]
_audit_zz_other_values = [((index*29 + 5) % 103) - 51 for index in range(80*80)]
_audit_zz_left = matrix(ZZ, 80, 80, _audit_zz_values)
_audit_zz_right = matrix(ZZ, 80, 80, _audit_zz_other_values)
_audit_zz_square = matrix(ZZ, 40, 40, _audit_zz_values[:40*40])
_audit_zz_vector_left = vector(ZZ, [index % 101 - 50 for index in range(4000)])
_audit_zz_vector_right = vector(ZZ, [index % 97 - 48 for index in range(4000)])

_audit_qq_values = [QQ(((index*17 + 3) % 101) - 50)/(index % 11 + 1) for index in range(80*80)]
_audit_qq_other_values = [QQ(((index*29 + 5) % 103) - 51)/(index % 13 + 1) for index in range(80*80)]
_audit_qq_left = matrix(QQ, 80, 80, _audit_qq_values)
_audit_qq_right = matrix(QQ, 80, 80, _audit_qq_other_values)
_audit_qq_square = matrix(QQ, 30, 30, _audit_qq_values[:30*30])
_audit_qq_vector_left = vector(QQ, [QQ(index % 101 - 50)/(index % 11 + 1) for index in range(3000)])
_audit_qq_vector_right = vector(QQ, [QQ(index % 97 - 48)/(index % 13 + 1) for index in range(3000)])

_audit_gf7_values = [(index*17 + 3) % 7 for index in range(100*100)]
_audit_gf7_other_values = [(index*29 + 5) % 7 for index in range(100*100)]
_audit_gf7_left = matrix(GF(7), 100, 100, _audit_gf7_values)
_audit_gf7_right = matrix(GF(7), 100, 100, _audit_gf7_other_values)
_audit_gf7_square = matrix(GF(7), 60, 60, _audit_gf7_values[:60*60])
_audit_gf7_vector_left = vector(GF(7), [index % 7 for index in range(4000)])
_audit_gf7_vector_right = vector(GF(7), [(index*3 + 1) % 7 for index in range(4000)])
`;

const pathWitnesses = {
  ZZ: {
    structural: [
      "sagejs.kernels.matrix.dense_integer",
      "dense_integer_matrix_add",
    ],
    ffi: [
      "sagejs.kernels.matrix.dense_integer_flint",
      "flint_dense_integer_matrix_mul",
    ],
  },
  QQ: {
    structural: [
      "sagejs.kernels.matrix.dense_rational",
      "dense_rational_matrix_add",
    ],
    ffi: [
      "sagejs.kernels.matrix.dense_rational_flint",
      "flint_dense_rational_matrix_mul",
    ],
  },
  "GF(7)": {
    structural: [
      "sagejs.kernels.matrix.dense_prime_field",
      "dense_prime_field_matrix_add",
    ],
    ffi: [
      "sagejs.kernels.matrix.dense_prime_field_flint",
      "flint_dense_prime_field_matrix_mul",
    ],
  },
};

async function nativeAvailability(session) {
  const availability = {};
  for (const [ring, witnesses] of Object.entries(pathWitnesses)) {
    availability[ring] = {};
    for (const [kind, [module, name]] of Object.entries(witnesses)) {
      const result = await session.evaluate(
        `from ${module} import ${name}\ngetattr(${name}, 'nativeAvailable', False)`,
      );
      availability[ring][kind] = result.repr === "True";
    }
  }
  return availability;
}

function implementationFor(testCase, availability) {
  if (testCase.path === "dynamic-python") return "dynamic-python";
  if (testCase.path === "generated-owned-resource") {
    return "generated-owned-resource-host-adapter";
  }
  const compiled = testCase.path === "packed-compiler-owned"
    ? availability[testCase.base_ring].structural
    : availability[testCase.base_ring].ffi;
  if (testCase.path === "packed-compiler-owned") {
    return compiled ? "typed-python-isolated" : "dynamic-python-explicit";
  }
  return compiled ? "generated-packed-ffi-isolated" : "generated-packed-ffi-host-adapter";
}

async function run(options = {}) {
  const environment = options.environment || process.env;
  const ratchets = validateRatchets(loadRatchets());
  const samples = positiveInteger(
    environment.SAGEJS_LINEAR_API_SAMPLES,
    "SAGEJS_LINEAR_API_SAMPLES",
    ratchets.default_samples,
  );
  if (samples < ratchets.minimum_samples && !options.allowFewSamples) {
    throw new Error(`at least ${ratchets.minimum_samples} samples are required`);
  }
  const budgetScale = positiveNumber(
    environment.SAGEJS_LINEAR_API_BUDGET_SCALE,
    "SAGEJS_LINEAR_API_BUDGET_SCALE",
    1,
  );

  const session = await createSage();
  try {
    const availability = await nativeAvailability(session);
    const definitions = ratchets.cases.flatMap((testCase, index) => [
      `def _audit_linear_case_${index}():`,
      "    started = _audit_runtime.wall_time()",
      "    result = None",
      `    for _audit_iteration in range(${testCase.iterations}):`,
      `        result = ${testCase.expression}`,
      "    if result is None:",
      "        raise RuntimeError('linear algebra audit operation returned None')",
      `    return ((_audit_runtime.wall_time() - started) * 1000) / ${testCase.iterations}`,
    ]);
    await session.evaluate(
      "import sagejs.runtime as _audit_runtime\n" + setup + definitions.join("\n"),
    );

    const results = [];
    for (let index = 0; index < ratchets.cases.length; index += 1) {
      const testCase = ratchets.cases[index];
      await session.evaluate(`_audit_linear_case_${index}()`);
      const timings = [];
      for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
        const result = await session.evaluate(`_audit_linear_case_${index}()`);
        const elapsed = Number(result.repr);
        if (!Number.isFinite(elapsed) || elapsed < 0) {
          throw new Error(`invalid ${testCase.id} timing: ${result.repr}`);
        }
        timings.push(elapsed);
      }
      const measured = median(timings);
      results.push({
        id: testCase.id,
        object: testCase.object,
        base_ring: testCase.base_ring,
        operation: testCase.operation,
        path: testCase.path,
        implementation: implementationFor(testCase, availability),
        median_ms: measured,
        budget_ms: testCase.budget_ms * budgetScale,
        passed: measured <= testCase.budget_ms * budgetScale,
      });
    }

    return {
      schema_version: 1,
      audit_id: ratchets.audit_id,
      samples,
      budget_scale: budgetScale,
      native_available: availability,
      results,
      passed: results.every((result) => result.passed),
    };
  } finally {
    session.close();
  }
}

function printTable(report) {
  console.log(`Linear algebra API audit (${report.samples} warm samples)`);
  console.log("  case                              implementation                         median / budget");
  for (const result of report.results) {
    console.log(
      `  ${result.id.padEnd(34)} ${result.implementation.padEnd(36)} ` +
      `${result.median_ms.toFixed(3).padStart(8)} / ${result.budget_ms.toFixed(1).padStart(6)} ms`,
    );
  }
}

if (require.main === module) {
  const json = process.argv.includes("--json");
  const check = process.argv.includes("--check");
  run().then((report) => {
    if (json) console.log(JSON.stringify(report, null, 2));
    else printTable(report);
    if (check && !report.passed) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  implementationFor,
  loadRatchets,
  median,
  nativeAvailability,
  run,
  validateRatchets,
};

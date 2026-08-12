#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const requestedRuntime = process.argv[2] ?? "sagejs";
const temporary = mkdtempSync(join(tmpdir(), "sagejs-exact-matrix-scalars-"));

const publicWorkload = String.raw`
import time


def _median(values):
    values.sort()
    return values[len(values) // 2]


_retained_results = []


def _measure(label, operation, samples=9):
    started = time.perf_counter()
    first_result = operation()
    first = 1000 * (time.perf_counter() - started)
    _retained_results.append(first_result)
    warm = []
    for _sample in range(samples):
        started = time.perf_counter()
        result = operation()
        warm.append(1000 * (time.perf_counter() - started))
        _retained_results.append(result)
    assert result.nrows() == _size and result.ncols() == _size
    print("RESULT", label, round(first, 6), round(_median(warm), 6))


_size = 300
_z_values = [
    ((1103515245 * index + 12345) % 2001) - 1000
    for index in range(_size * _size)
]
_q_values = [
    QQ(_z_values[index]) / (index % 17 + 1)
    for index in range(_size * _size)
]
_integers = matrix(ZZ, _size, _size, _z_values)
_rationals = matrix(QQ, _size, _size, _q_values)
_rational_scalar = QQ(17) / 19

_measure("zz_neg", lambda: -_integers)
_measure("zz_mul", lambda: 17 * _integers)
_measure("zz_div", lambda: _integers / 17)
_measure("qq_neg", lambda: -_rationals)
_measure("qq_mul", lambda: _rational_scalar * _rationals)
_measure("qq_div", lambda: _rationals / _rational_scalar)
`;

const boundaryWorkload = String.raw`
from sagejs.ffi.flint import (
    fmpq_matrix_neg,
    fmpq_matrix_scalar_mul,
    fmpz_matrix_neg,
    fmpz_matrix_scalar_mul,
)


def _boundary_median(operation, close, batches=5, iterations=500):
    samples = []
    for _batch in range(batches):
        results = []
        started = time.perf_counter()
        for _iteration in range(iterations):
            results.append(operation())
        samples.append(
            1000000 * (time.perf_counter() - started) / iterations
        )
        for result in results:
            close(result)
    return _median(samples)


_small_z = matrix(ZZ, 1, 1, [7])
_small_q = matrix(QQ, 1, 1, [QQ(7) / 11])
_small_z_resource = _small_z._integer_resource()
_small_q_resource = _small_q._rational_resource()


def _close_resource(resource):
    resource.close()


def _close_integer_matrix(value):
    value._integer_resource().close()


def _close_rational_matrix(value):
    value._rational_resource().close()


_boundary_cases = [
    (
        "zz_neg",
        lambda: fmpz_matrix_neg(_small_z_resource),
        _close_resource,
        lambda: -_small_z,
        _close_integer_matrix,
    ),
    (
        "zz_mul",
        lambda: fmpz_matrix_scalar_mul(_small_z_resource, 17),
        _close_resource,
        lambda: 17 * _small_z,
        _close_integer_matrix,
    ),
    (
        "qq_neg",
        lambda: fmpq_matrix_neg(_small_q_resource),
        _close_resource,
        lambda: -_small_q,
        _close_rational_matrix,
    ),
    (
        "qq_mul",
        lambda: fmpq_matrix_scalar_mul(_small_q_resource, 17, 19),
        _close_resource,
        lambda: (QQ(17) / 19) * _small_q,
        _close_rational_matrix,
    ),
    (
        "qq_div",
        lambda: fmpq_matrix_scalar_mul(_small_q_resource, 19, 17),
        _close_resource,
        lambda: _small_q / (QQ(17) / 19),
        _close_rational_matrix,
    ),
]

for label, direct, close_direct, public, close_public in _boundary_cases:
    direct_time = _boundary_median(direct, close_direct)
    public_time = _boundary_median(public, close_public)
    print(
        "BOUNDARY",
        label,
        round(direct_time, 6),
        round(public_time, 6),
        round(public_time / direct_time, 6),
    )
`;

function run(label, command, source) {
  const filename = join(temporary, `${label}-exact-matrix-scalars.py`);
  writeFileSync(filename, source);
  const started = performance.now();
  const result = spawnSync(command[0], [...command.slice(1), filename], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
      SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
    },
    timeout: 300_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const elapsed = performance.now() - started;
  return { label, elapsed, stdout: result.stdout, stderr: result.stderr };
}

function parse(runResult) {
  const dense = Object.create(null);
  const boundaries = Object.create(null);
  for (const line of runResult.stdout.trim().split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] === "RESULT") {
      dense[fields[1]] = { first: Number(fields[2]), warm: Number(fields[3]) };
    } else if (fields[0] === "BOUNDARY") {
      boundaries[fields[1]] = {
        directMicroseconds: Number(fields[2]),
        publicMicroseconds: Number(fields[3]),
        ratio: Number(fields[4]),
      };
    }
  }
  return { dense, boundaries };
}

try {
  const runs = [];
  if (requestedRuntime === "all" || requestedRuntime === "sagejs") {
    runs.push(run(
      "sagejs",
      [process.execPath, resolve(root, "bin", "sagejs")],
      publicWorkload + boundaryWorkload,
    ));
  }
  if (requestedRuntime === "all" || requestedRuntime === "sage") {
    const defaultSage = existsSync("/home/user/sagelite/sage")
      ? "/home/user/sagelite/sage"
      : "/opt/cocalc-webdev-python/bin/sage";
    const sage = process.env.SAGE_BIN || defaultSage;
    runs.push(run(
      "sage",
      [sage, "-python"],
      "from sage.all import *\n" + publicWorkload,
    ));
  }

  const report = {
    schema: "sagejs.benchmark/exact-matrix-scalar-operations-v1",
    workload: {
      rows: 300,
      columns: 300,
      warmSamples: 9,
      boundaryRows: 1,
      boundaryColumns: 1,
      boundaryBatches: 5,
      boundaryIterations: 500,
    },
    implementation: "public-matrix-to-generated-flint-resource",
    runtimes: Object.fromEntries(runs.map((item) => [
      item.label,
      { processMilliseconds: item.elapsed, ...parse(item) },
    ])),
  };

  if (report.runtimes.sagejs !== undefined) {
    const denseBudget = {
      zz_neg: 10,
      zz_mul: 10,
      zz_div: 25,
      qq_neg: 15,
      qq_mul: 25,
      qq_div: 25,
    };
    for (const [name, budget] of Object.entries(denseBudget)) {
      const measured = report.runtimes.sagejs.dense[name]?.warm;
      assert.ok(Number.isFinite(measured), `missing dense timing ${name}`);
      assert.ok(measured < budget, `${name} took ${measured} ms (budget ${budget} ms)`);
    }
    const boundaryRatioBudget = {
      zz_neg: 4.5,
      zz_mul: 6,
      qq_neg: 4,
      qq_mul: 6.5,
      qq_div: 7,
    };
    for (const [name, budget] of Object.entries(boundaryRatioBudget)) {
      const measured = report.runtimes.sagejs.boundaries[name]?.ratio;
      assert.ok(Number.isFinite(measured), `missing boundary timing ${name}`);
      assert.ok(
        measured < budget,
        `${name} public/direct ratio ${measured} exceeded ${budget}`,
      );
    }
  }

  console.log(JSON.stringify(report, null, 2));
  for (const item of runs) {
    if (item.stderr !== "") {
      process.stderr.write(`\n${item.label} stderr\n${item.stderr}`);
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

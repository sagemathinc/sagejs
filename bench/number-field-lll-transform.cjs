#!/usr/bin/env node
"use strict";

const { arch, cpus, platform } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const executable = process.env.SAGEJS_TEST_EXECUTABLE || join(root, "bin", "sagejs");
const samples = Number.parseInt(process.env.SAGEJS_BENCH_SAMPLES || "3", 10);
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 9) {
  throw new Error("SAGEJS_BENCH_SAMPLES must be an integer in 1..9");
}

const source = String.raw`
import hashlib
import json
import time

from sagejs.native import execution_mode
from sagejs.kernels.matrix.dense_integer_flint import (
    flint_dense_integer_matrix_lll_transform,
)
from sagejs.number_fields.class_group_relations import (
    _exact_lll_reduce_with_transform,
    _gram_schmidt,
    _integer_determinant,
    _matrix_times_rows,
    _minkowski_integer_rows,
    _readable_exact_lll_reduce_with_transform,
)

R = PolynomialRing(QQ, "x")
x = R.gen()

def validate(source, reduced, transform):
    assert _matrix_times_rows(transform, source) == reduced
    assert abs(_integer_determinant(transform)) == 1
    mu, norms = _gram_schmidt(reduced)
    for row_index in range(1, len(reduced)):
        for previous in range(row_index):
            assert abs(mu[row_index][previous]) <= QQ(1) / QQ(2)
        assert norms[row_index] >= (
            QQ(3) / QQ(4) - mu[row_index][row_index - 1] ** 2
        ) * norms[row_index - 1]

def digest(reduced, transform):
    payload = json.dumps(
        {"basis": reduced, "transform": transform},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(payload).hexdigest()

def measure(name, polynomial):
    field = NumberField(polynomial, "a")
    order = field.maximal_order()
    rows, _signature = _minkowski_integer_rows(order.ideal(1), 128, 96)
    native_basis, native_transform = _exact_lll_reduce_with_transform(rows)
    readable_basis, readable_transform = _readable_exact_lll_reduce_with_transform(rows)
    validate(rows, native_basis, native_transform)
    validate(rows, readable_basis, readable_transform)
    native_samples = []
    readable_samples = []
    for _sample in range(${samples}):
        started = time.perf_counter_ns()
        current_basis, current_transform = _exact_lll_reduce_with_transform(rows)
        native_samples.append((time.perf_counter_ns() - started) / 1000000)
        assert current_basis == native_basis and current_transform == native_transform
        started = time.perf_counter_ns()
        current_basis, current_transform = _readable_exact_lll_reduce_with_transform(rows)
        readable_samples.append((time.perf_counter_ns() - started) / 1000000)
        assert current_basis == readable_basis and current_transform == readable_transform
    native_samples.sort()
    readable_samples.sort()
    native_median = native_samples[len(native_samples) // 2]
    readable_median = readable_samples[len(readable_samples) // 2]
    return {
        "name": name,
        "degree": field.degree(),
        "rows": len(rows),
        "columns": len(rows[0]),
        "native_samples_ms": native_samples,
        "native_median_ms": native_median,
        "readable_samples_ms": readable_samples,
        "readable_median_ms": readable_median,
        "speedup": readable_median / native_median,
        "native_digest": digest(native_basis, native_transform),
        "readable_digest": digest(readable_basis, readable_transform),
    }

print(json.dumps({
    "execution_mode": execution_mode(flint_dense_integer_matrix_lll_transform),
    "workloads": [
        measure("nonreal-cubic", x**3 - x**2 - 6*x - 12),
        measure("degree-nine", x**9 - x - 1),
    ],
}, separators=(",", ":")))
`;

const result = spawnSync(executable, ["--python", "-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
  maxBuffer: 10 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const measured = JSON.parse(result.stdout.trim());
const report = {
  schema: "sagejs.number-fields/exact-lll-transform-benchmark-v1",
  boundary:
    "exact 3/4-LLL reduction of fixed-point Minkowski rows with an authenticated unimodular row transform",
  sample_policy: `${samples} timed native and readable samples after one warmup`,
  host: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
  },
  measured,
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--check")) {
  if (!["native", "native-capable"].includes(measured.execution_mode)) {
    throw new Error("exact LLL benchmark did not use the FLINT implementation");
  }
  const degreeNine = measured.workloads.find((entry) => entry.degree === 9);
  if (!degreeNine || degreeNine.speedup < 10) {
    throw new Error("degree-nine exact LLL speedup is below 10x");
  }
}

#!/usr/bin/env node

"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..", "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kernels.py",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

const program = String.raw`
import json
import time
from sagejs.native import is_compiled
from sagejs.hyperelliptic_curves.jacobian_kernels import packed_cantor_add_batch


def median(samples):
    samples.sort()
    return samples[len(samples) // 2]


def timed(function, repetitions=7):
    samples = []
    value = None
    for _index in range(repetitions):
        started = time.perf_counter_ns()
        value = function()
        samples.append(time.perf_counter_ns() - started)
    return median(samples), value


def deterministic_basis(curve, context, count):
    field = curve.base_ring()
    f, h = curve.hyperelliptic_polynomials()
    assert h.is_zero()
    points = []
    candidate = 0
    while len(points) < count:
        x_value = field(ZZ(candidate))
        discriminant = f(x_value)
        if discriminant.is_square():
            y_value = discriminant.sqrt()
            points.append(context.unpack((
                1,
                (-candidate) % context.prime,
                1, 0, 0,
                int(y_value.lift()),
                0, 0,
            )))
        candidate += 1
    return tuple(points)


R = PolynomialRing(GF(1009), "x")
x = R.gen()
rows = []
for genus, curve in [
    (2, HyperellipticCurve(x**5 + x + 1)),
    (3, HyperellipticCurve(x**7 + 2*x + 1)),
]:
    J = curve.jacobian()
    context = J.prepared_arithmetic(algorithm="native", max_batch_items=2000)
    degree_one = deterministic_basis(curve, context, 64)
    basis = tuple(
        degree_one[index] + degree_one[(13 * index + 5) % len(degree_one)]
        for index in range(len(degree_one))
    )
    left = tuple(basis[index % len(basis)] for index in range(1000))
    right = tuple(basis[(17 * index + 7) % len(basis)] for index in range(1000))
    scalars = tuple(2**255 + 65537 * index + 1 for index in range(1000))
    scalar_comparison_items = 8
    scalar_throughput_items = 64

    native_add = lambda: context.add_batch(left, right, algorithm="native")
    native_add_materialized = lambda: context.add_batch(
        left, right, algorithm="native", materialize=True
    )
    reference_add = lambda: context.add_batch(left, right, algorithm="reference")
    native_scalar = lambda: context.scalar_batch(
        left[:scalar_comparison_items],
        scalars[:scalar_comparison_items],
        algorithm="native",
    )
    native_scalar_materialized = lambda: context.scalar_batch(
        left[:scalar_comparison_items],
        scalars[:scalar_comparison_items],
        algorithm="native",
        materialize=True,
    )
    reference_scalar = lambda: context.scalar_batch(
        left[:scalar_comparison_items],
        scalars[:scalar_comparison_items],
        algorithm="reference",
    )
    native_scalar_throughput = lambda: context.scalar_batch(
        left[:scalar_throughput_items],
        scalars[:scalar_throughput_items],
        algorithm="native",
    )

    native_add()
    native_scalar()
    _diagnostic_add_result, add_diagnostics = context.add_batch(
        left, right, algorithm="native", diagnostics=True
    )
    _diagnostic_materialized_add_result, materialized_add_diagnostics = (
        context.add_batch(
            left,
            right,
            algorithm="native",
            diagnostics=True,
            materialize=True,
        )
    )
    native_add_ns, native_add_result = timed(native_add)
    native_add_materialized_ns, native_add_materialized_result = timed(
        native_add_materialized
    )
    reference_add_ns, reference_add_result = timed(reference_add, 3)
    native_scalar_ns, native_scalar_result = timed(native_scalar, 5)
    native_scalar_materialized_ns, native_scalar_materialized_result = timed(
        native_scalar_materialized, 3
    )
    reference_scalar_ns, reference_scalar_result = timed(reference_scalar, 1)
    native_scalar_throughput_ns, native_scalar_throughput_result = timed(
        native_scalar_throughput, 1
    )
    assert native_add_result == reference_add_result
    assert native_add_materialized_result == reference_add_result
    assert all(not value.is_materialized() for value in native_add_result)
    assert all(value.is_materialized() for value in native_add_materialized_result)
    assert native_scalar_result == reference_scalar_result
    assert native_scalar_materialized_result == reference_scalar_result
    assert native_scalar_throughput_result[:scalar_comparison_items] == reference_scalar_result
    digest = context.fingerprint(context.sum(native_add_result, algorithm="native"))
    rows.append({
        "genus": genus,
        "prime": 1009,
        "batch_items": 1000,
        "scalar_comparison_items": scalar_comparison_items,
        "scalar_throughput_items": scalar_throughput_items,
        "scalar_bits": 256,
        "native_add_median_ns": native_add_ns,
        "native_add_materialized_median_ns": native_add_materialized_ns,
        "native_add_stages": add_diagnostics.to_dict()["timings_ns"],
        "native_add_materialized_stages": (
            materialized_add_diagnostics.to_dict()["timings_ns"]
        ),
        "reference_add_median_ns": reference_add_ns,
        "add_speedup": reference_add_ns / native_add_ns,
        "materialized_add_speedup": reference_add_ns / native_add_materialized_ns,
        "native_scalar_median_ns": native_scalar_ns,
        "native_scalar_materialized_median_ns": native_scalar_materialized_ns,
        "native_scalar_throughput_ns": native_scalar_throughput_ns,
        "reference_scalar_median_ns": reference_scalar_ns,
        "scalar_speedup": reference_scalar_ns / native_scalar_ns,
        "materialized_scalar_speedup": (
            reference_scalar_ns / native_scalar_materialized_ns
        ),
        "result_digest": digest,
    })

print(json.dumps({
    "schema": "sagejs.hyperelliptic.public-jacobian-benchmark.v1",
    "compiled": is_compiled(packed_cantor_add_batch),
    "workload": "resident prepared context; medians; 1000 public results",
    "rows": rows,
}, sort_keys=True))
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-jacobian-bench-"));
try {
  const cache = join(temporary, "cache");
  const witness = join(temporary, "benchmark.py");
  writeFileSync(witness, program);
  run(process.execPath, [
    sagejs,
    "native",
    "compile",
    source,
    "--cache-root",
    cache,
  ]);
  const output = run(process.execPath, [sagejs, witness], {
    env: {
      SAGEJS_NATIVE_CACHE_DIR: cache,
    },
  });
  process.stdout.write(output + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

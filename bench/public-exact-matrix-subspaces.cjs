#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

const program = String.raw`
import json
import time
import sagejs.runtime as runtime


def median_ms(function, repetitions=5):
    function()
    samples = []
    for _repeat in range(repetitions):
        started = time.perf_counter()
        function()
        samples.append(1000 * (time.perf_counter() - started))
    samples.sort()
    return samples[len(samples) // 2]


def paired_median_ms(left, right, repetitions=7):
    """Measure allocating operations under balanced resource/GC pressure."""
    left()
    right()
    left_samples = []
    right_samples = []
    for repeat in range(repetitions):
        if repeat % 2 == 0:
            functions = [(left, left_samples), (right, right_samples)]
        else:
            functions = [(right, right_samples), (left, left_samples)]
        for function, samples in functions:
            started = time.perf_counter()
            function()
            samples.append(1000 * (time.perf_counter() - started))
    left_samples.sort()
    right_samples.sort()
    return (
        left_samples[len(left_samples) // 2],
        right_samples[len(right_samples) // 2],
    )


def scalar_basis(echelon):
    echelon._row_vectors_cache = runtime.undefined
    echelon._exact_host_values_cache = runtime.undefined
    rows = []
    for row in echelon.rows():
        if any(entry != 0 for entry in row):
            rows.append(row)
    entries = []
    for row in rows:
        entries.extend(row)
    return matrix(echelon.base_ring(), len(rows), echelon.ncols(), entries)


def serialized_pivots(source, echelon):
    echelon._exact_host_values_cache = runtime.undefined
    values = echelon._exact_host_values()
    pivots = []
    previous = -1
    for row in range(echelon.nrows()):
        for column in range(previous + 1, echelon.ncols()):
            if values[row * echelon.ncols() + column] != 0:
                pivots.append(column)
                previous = column
                break
    return tuple(pivots)


lazy_started = time.perf_counter()
lazy_probe = matrix(ZZ, [[1, 2], [3, 4]]).row_space().basis_matrix()
first_subspace_lazy_load_ms = 1000 * (time.perf_counter() - lazy_started)
assert lazy_probe.nrows() == 2

measurements = []
for label, base in [("ZZ", ZZ), ("QQ", QQ), ("GF7", GF(7)), ("GF2", GF(2))]:
    source = random_matrix(base, 200, 300)
    echelon = source.echelon_form()
    pivots = source.pivots()
    indices = tuple(range(len(pivots)))
    direct = lambda: echelon.matrix_from_prefix_rows(len(indices))
    public = lambda: source.row_space().basis_matrix()
    scalar = lambda: scalar_basis(echelon)
    first_started = time.perf_counter()
    first_public = public()
    first_public_ms = 1000 * (time.perf_counter() - first_started)
    assert first_public == direct() == scalar()
    direct_ms, public_ms = paired_median_ms(direct, public)
    scalar_ms = median_ms(scalar, 3)
    transposed = source.transpose()
    column_echelon = transposed.echelon_form()
    column_indices = tuple(range(len(transposed.pivots())))
    direct_column = lambda: column_echelon.matrix_from_prefix_rows(
        len(column_indices)
    )
    source.transpose = lambda: transposed
    public_column = lambda: source.column_space().basis_matrix()
    scalar_column = lambda: scalar_basis(column_echelon)
    first_column_started = time.perf_counter()
    first_public_column = public_column()
    first_public_column_ms = 1000 * (
        time.perf_counter() - first_column_started
    )
    assert first_public_column == direct_column() == scalar_column()
    direct_column_ms, public_column_ms = paired_median_ms(
        direct_column, public_column
    )
    scalar_column_ms = median_ms(scalar_column, 3)
    measurements.append({
        "domain": label,
        "rank": len(pivots),
        "first_public_row_space_ms": first_public_ms,
        "direct_selector_ms": direct_ms,
        "public_row_space_ms": public_ms,
        "scalar_reconstruction_ms": scalar_ms,
        "public_over_selector": public_ms / max(direct_ms, 0.000001),
        "scalar_speedup": scalar_ms / max(public_ms, 0.000001),
        "first_public_column_space_ms": first_public_column_ms,
        "direct_column_selector_ms": direct_column_ms,
        "public_column_space_ms": public_column_ms,
        "scalar_column_reconstruction_ms": scalar_column_ms,
        "public_column_over_selector": public_column_ms / max(direct_column_ms, 0.000001),
        "scalar_column_speedup": scalar_column_ms / max(public_column_ms, 0.000001),
    })

pivot_measurements = []
for label, base in [("ZZ", ZZ), ("QQ", QQ)]:
    entries = [
        1 if column == row else (row + 2 if column == row + 300 else 0)
        for row in range(300)
        for column in range(500)
    ]
    source = matrix(base, 300, 500, entries)
    if base is ZZ:
        source._hermite_cache = source
    else:
        source._rref_cache = source
    source.set_immutable()
    echelon = source
    expected = source.pivots()

    def public_pivots():
        source._pivots_cache = runtime.undefined
        echelon._pivots_cache = runtime.undefined
        return source.pivots()

    def old_pivots():
        return serialized_pivots(source, echelon)

    assert public_pivots() == old_pivots() == expected
    public_ms = median_ms(public_pivots)
    public_pivots()
    cached_ms = median_ms(source.pivots)
    serialized_ms = median_ms(old_pivots, 3)
    pivot_measurements.append({
        "domain": label,
        "rows": 300,
        "columns": 500,
        "rank": len(expected),
        "bounded_pivot_ms": public_ms,
        "cached_pivot_ms": cached_ms,
        "serialized_host_scan_ms": serialized_ms,
        "speedup": serialized_ms / max(public_ms, 0.000001),
    })

print(json.dumps({
    "schema": "sagejs.benchmark/public-exact-matrix-subspaces-v2",
    "policy": "median warmed extraction after one shared echelon computation",
    "first_subspace_lazy_load_ms": first_subspace_lazy_load_ms,
    "measurements": measurements,
    "pivot_measurements": pivot_measurements,
}, separators=(",", ":")))
`;

const directory = mkdtempSync(join(tmpdir(), "sagejs-subspace-benchmark-"));
let result;
try {
  const script = join(directory, "benchmark.py");
  writeFileSync(script, program);
  result = spawnSync(sagejs, ["--python", script], {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    env: {
      ...process.env,
      SAGEJS_FORBID_MATRIX_NAPI: "1",
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
      SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
    },
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.equal(result.stderr, "");
const report = JSON.parse(result.stdout.trim().split("\n").at(-1));
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--check")) {
  for (const measurement of report.measurements) {
    // Keep the public wrapper within a small fixed noise floor or 2x the exact
    // generated prefix operation that supplies its canonical basis matrix.
    assert.ok(
      measurement.public_row_space_ms <=
        Math.max(2, 2 * measurement.direct_selector_ms),
      `${measurement.domain} public extraction exceeds direct-selector gate`,
    );
    assert.ok(
      measurement.scalar_speedup >= 5,
      `${measurement.domain} public extraction is not 5x faster than scalar reconstruction`,
    );
    assert.ok(
      measurement.public_column_space_ms <=
        Math.max(2, 2 * measurement.direct_column_selector_ms),
      `${measurement.domain} public column extraction exceeds direct-selector gate`,
    );
    assert.ok(
      measurement.scalar_column_speedup >= 5,
      `${measurement.domain} public column extraction is not 5x faster than scalar reconstruction`,
    );
  }
  for (const measurement of report.pivot_measurements) {
    assert.ok(
      measurement.speedup >= 20,
      `${measurement.domain} bounded pivots are not 20x faster than serialization`,
    );
  }
}

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

const program = String.raw`
import json
import time

from sagejs.linear_algebra.matrix_subspaces import canonical_row_basis


def dimensions(value):
    return value.nrows(), value.ncols()


def finish(value):
    value.set_immutable()


def selected_basis(value):
    return canonical_row_basis(
        value,
        dimensions,
        lambda source: source.echelon_form(),
        lambda echelon: echelon.rank(),
        lambda echelon, indices: echelon.matrix_from_rows(indices),
        finish,
    ).matrix


def median_ms(function, repetitions=5):
    function()
    samples = []
    for _repeat in range(repetitions):
        started = time.perf_counter()
        function()
        samples.append(1000 * (time.perf_counter() - started))
    samples.sort()
    return samples[len(samples) // 2]


results = []
for label, base in [("ZZ", ZZ), ("QQ", QQ), ("GF7", GF(7)), ("GF2", GF(2))]:
    source = random_matrix(base, 200, 300)
    # This benchmark isolates basis extraction. Both candidates reuse the same
    # already computed echelon result; only the current path decodes every row
    # and reconstructs a matrix through host scalar objects.
    source.echelon_form()
    current = source.row_space().basis_matrix()
    selected = selected_basis(source)
    assert selected == current
    transposed = source.transpose()
    transposed.echelon_form()
    current_column = transposed.row_space().basis_matrix()
    selected_column = selected_basis(transposed)
    assert selected_column == current_column
    current_row_ms = median_ms(lambda: source.row_space().basis_matrix())
    selected_row_ms = median_ms(lambda: selected_basis(source))
    current_column_ms = median_ms(lambda: transposed.row_space().basis_matrix())
    selected_column_ms = median_ms(lambda: selected_basis(transposed))
    results.append({
        "domain": label,
        "rank": source.rank(),
        "current_row_basis_ms": current_row_ms,
        "selected_row_basis_ms": selected_row_ms,
        "row_speedup": current_row_ms / selected_row_ms,
        "current_column_basis_ms": current_column_ms,
        "selected_column_basis_ms": selected_column_ms,
        "column_speedup": current_column_ms / selected_column_ms,
    })

print(json.dumps(results, separators=(",", ":")))
`;

const result = spawnSync(sagejs, ["--python"], {
  cwd: root,
  encoding: "utf8",
  input: program,
  timeout: 300_000,
  env: {
    ...process.env,
    SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
    SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
  },
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.equal(result.stderr, "");
const measurements = JSON.parse(result.stdout.trim().split("\n").at(-1));

const report = {
  schema: "sagejs.benchmark/canonical-matrix-subspaces-v1",
  workload: {
    source_rows: 200,
    source_columns: 300,
    samples: 5,
    policy: "median warm basis extraction after one shared echelon computation",
  },
  expected_public_wiring: [
    "compute echelon_form once",
    "read a domain-correct leading basis-row count",
    "use rank metadata only for ZZ and fields",
    "bulk matrix_from_rows(range(basis_row_count))",
    "mark the basis immutable",
    "construct the subspace with already_echelonized=true",
  ],
  measurements,
};

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--check")) {
  for (const measurement of measurements) {
    assert.ok(
      measurement.selected_row_basis_ms < measurement.current_row_basis_ms,
      `${measurement.domain} direct row selection did not improve extraction`,
    );
    assert.ok(
      measurement.selected_column_basis_ms < measurement.current_column_basis_ms,
      `${measurement.domain} direct column selection did not improve extraction`,
    );
  }
}

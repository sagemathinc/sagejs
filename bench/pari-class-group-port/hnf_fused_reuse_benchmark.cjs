#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const root = resolve(__dirname, "../..");
const fixturePath = resolve(
  __dirname,
  "vector429_p2_mixed_quotient_matrix.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const corpus = JSON.parse(
  readFileSync(resolve(root, "test/fixtures/number-field-maximal-order-corpus.json"), "utf8"),
);
const vector429 = corpus.cases.find((item) => item.id === fixture.source_case);
const verifyOnly = process.argv.includes("--verify-only");
const samplesArgument = process.argv.find((argument) =>
  argument.startsWith("--pairs="),
);
const pairs = verifyOnly
  ? 0
  : samplesArgument
    ? Number(samplesArgument.slice("--pairs=".length))
    : 7;

if (!Number.isInteger(pairs) || pairs < (verifyOnly ? 0 : 1) || pairs > 21) {
  throw new Error("--pairs must be an integer in 1..21");
}
if (
  fixture.schema !==
    "sagejs.benchmark/vector429-p2-mixed-quotient-matrix-v1" ||
  fixture.rows !== 128 ||
  fixture.columns !== 64 ||
  fixture.batch_size !== 2
) {
  throw new Error("unexpected frozen vector429 matrix metadata");
}
const matrixText = JSON.stringify(fixture.matrix);
const matrixDigest = createHash("sha256").update(matrixText).digest("hex");
if (matrixDigest !== fixture.matrix_sha256) {
  throw new Error("frozen vector429 matrix digest mismatch");
}
if (!Array.isArray(fixture.final_hnf)) {
  throw new Error("frozen vector429 matrix omits its independent final HNF");
}
if (!vector429 || vector429.basis.numerator.length !== fixture.columns) {
  throw new Error("missing frozen PARI vector429 lattice oracle");
}
let oracleDenominator = BigInt(vector429.basis.denominator);
let oracleExponent = 0;
while (oracleDenominator % 2n === 0n) {
  oracleDenominator /= 2n;
  oracleExponent += 1;
}
if (oracleExponent !== 11) {
  throw new Error(`unexpected vector429 p=2 denominator exponent: ${oracleExponent}`);
}
const localDenominator = 1n << BigInt(oracleExponent);
const pariLocalGenerators = vector429.basis.numerator.map((row) =>
  row.map((value) => {
    const residue = BigInt(value) % localDenominator;
    return (residue < 0n ? residue + localDenominator : residue).toString();
  }),
);
for (let row = 0; row < fixture.columns; row += 1) {
  pariLocalGenerators.push(
    Array.from({ length: fixture.columns }, (_unused, column) =>
      row === column ? localDenominator.toString() : "0",
    ),
  );
}

const source = String.raw`
import json
import time

from sagejs.native import is_compiled
from sagejs.number_fields.buchmann_lenstra import packed_row_hnf_in_place
from sagejs.number_fields.om_maxmin import (
    _packed_incremental_row_hnf,
    _packed_row_hnf_once,
    packed_incremental_row_hnf_in_place,
)

rows = [[int(value) for value in row] for row in ${matrixText}]
final_oracle = [
    [int(value) for value in row]
    for row in ${JSON.stringify(fixture.final_hnf)}
]
pari_local_generators = [
    [int(value) for value in row]
    for row in ${JSON.stringify(pariLocalGenerators)}
]
degree = 64
batch_size = 2

if not is_compiled(packed_row_hnf_in_place):
    raise AssertionError("the repeated HNF kernel is not compiled")
if not is_compiled(packed_incremental_row_hnf_in_place):
    raise AssertionError("the fused HNF kernel is not compiled")
if len(rows) != 128 or any(len(row) != degree for row in rows):
    raise AssertionError("the frozen matrix is not 128 by 64")

def in_lower_row_lattice(row, basis):
    remaining = list(row)
    for pivot in range(degree - 1, -1, -1):
        diagonal = basis[pivot][pivot]
        if diagonal <= 0 or remaining[pivot] % diagonal:
            return False
        coefficient = remaining[pivot] // diagonal
        for column in range(pivot + 1):
            remaining[column] -= coefficient * basis[pivot][column]
    return not any(remaining)

if any(
    final_oracle[row][column]
    for row in range(degree)
    for column in range(row + 1, degree)
):
    raise AssertionError("the final oracle is not lower triangular")
determinant = 1
for index in range(degree):
    determinant *= final_oracle[index][index]
expected_determinant = 2 ** (${oracleExponent} * degree - 332)
pari_lattice_equal = (
    determinant == expected_determinant
    and all(in_lower_row_lattice(row, final_oracle) for row in pari_local_generators)
)
if not pari_lattice_equal:
    raise AssertionError("the final HNF differs from the frozen PARI p=2 lattice")

def baseline():
    hermite = [list(row) for row in rows[:degree]]
    for offset in range(degree, len(rows), batch_size):
        hermite = _packed_row_hnf_once(
            hermite + rows[offset:offset + batch_size],
            degree,
            packed_row_hnf_in_place,
        )
    return hermite

def candidate():
    return _packed_incremental_row_hnf(rows, degree)

# Authenticate every state transition.  This deliberately runs outside the
# timed region: each candidate prefix starts from the frozen scalar identity,
# while the baseline carries the preceding canonical basis forward.
prefix_equalities = []
baseline_word_capacities = []
hermite = [list(row) for row in rows[:degree]]
for offset in range(degree, len(rows), batch_size):
    active = hermite + rows[offset:offset + batch_size]
    maximum_bits = max(
        (abs(value).bit_length() for row in active for value in row),
        default=0,
    )
    baseline_word_capacities.append(
        max(16, (maximum_bits + 63) // 64 + 8 * degree)
    )
    hermite = _packed_row_hnf_once(
        active,
        degree,
        packed_row_hnf_in_place,
    )
    fused_prefix = _packed_incremental_row_hnf(
        rows[:offset + batch_size], degree
    )
    prefix_equalities.append(hermite == fused_prefix)
    if not prefix_equalities[-1]:
        raise AssertionError(("prefix mismatch", offset + batch_size))
if hermite != final_oracle:
    raise AssertionError("repeated HNF differs from the independent final oracle")
if candidate() != final_oracle:
    raise AssertionError("fused HNF differs from the independent final oracle")
candidate_maximum_bits = max(
    (abs(value).bit_length() for row in rows for value in row), default=0
)
candidate_word_capacity = max(
    16, (candidate_maximum_bits + 63) // 64 + 8 * degree
)

def measure(function):
    started = time.perf_counter_ns()
    answer = function()
    elapsed = time.perf_counter_ns() - started
    if answer != final_oracle:
        raise AssertionError("a timed HNF result differs from the final oracle")
    return elapsed

baseline_times = []
candidate_times = []
orders = []
if ${pairs}:
    # One unrecorded execution per arm establishes stable compiled buffers and
    # page residency.  Pair order alternates to reject monotone thermal drift.
    measure(baseline)
    measure(candidate)
    for pair in range(${pairs}):
        if pair % 2 == 0:
            order = "AB"
            baseline_times.append(measure(baseline))
            candidate_times.append(measure(candidate))
        else:
            order = "BA"
            candidate_times.append(measure(candidate))
            baseline_times.append(measure(baseline))
        orders.append(order)

print(json.dumps({
    "prefix_equalities": prefix_equalities,
    "final_equal": hermite == final_oracle,
    "pari_lattice_equal": pari_lattice_equal,
    "baseline_word_capacities": baseline_word_capacities,
    "candidate_word_capacity": candidate_word_capacity,
    "orders": orders,
    "baseline_nanoseconds": baseline_times,
    "candidate_nanoseconds": candidate_times,
}))
`;

const child = spawnSync(process.execPath, [resolve(root, "bin/sagejs"), "--python"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: verifyOnly ? 10 * 60_000 : 30 * 60_000,
  maxBuffer: 16 * 1024 * 1024,
});
if (child.status !== 0) {
  throw new Error([child.stdout, child.stderr].filter(Boolean).join("\n"));
}
const measured = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
const baseline = measured.baseline_nanoseconds;
const candidate = measured.candidate_nanoseconds;
const mean = (values) =>
  values.length === 0
    ? null
    : values.reduce((left, right) => left + right, 0) / values.length;
const baselineMean = mean(baseline);
const candidateMean = mean(candidate);

const columns = fixture.columns;
const stages = (fixture.rows - columns) / fixture.batch_size;
const activeRows = columns + fixture.batch_size;
const perRepeatedCall = {
  source_buffer_entries: activeRows * columns,
  output_buffer_entries: activeRows * columns,
  workspace_buffer_entries: 2 * columns,
  python_input_entries_materialized: activeRows * columns,
  published_integer_entries: activeRows * columns,
  published_hnf_entries: columns * columns,
};
const multiply = (record, count) =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value * count]),
  );
const accounting = {
  baseline: {
    native_calls: stages,
    integer_buffer_allocations: 3 * stages,
    ...multiply(perRepeatedCall, stages),
    reserved_output_workspace_words: measured.baseline_word_capacities.reduce(
      (total, capacity) =>
        total +
        capacity *
          (perRepeatedCall.output_buffer_entries +
            perRepeatedCall.workspace_buffer_entries),
      0,
    ),
  },
  candidate: {
    native_calls: 1,
    integer_buffer_allocations: 3,
    source_buffer_entries: fixture.rows * columns,
    output_buffer_entries: activeRows * columns,
    workspace_buffer_entries: 2 * columns,
    python_input_entries_materialized: fixture.rows * columns,
    published_integer_entries: activeRows * columns,
    published_hnf_entries: columns * columns,
    reserved_output_workspace_words:
      measured.candidate_word_capacity *
      (activeRows * columns + 2 * columns),
  },
};
accounting.baseline.reserved_output_workspace_bytes =
  accounting.baseline.reserved_output_workspace_words * 8;
accounting.candidate.reserved_output_workspace_bytes =
  accounting.candidate.reserved_output_workspace_words * 8;

const report = {
  schema: "sagejs.benchmark/hnf-fused-reuse-ab-v1",
  fixture: {
    path: "bench/pari-class-group-port/vector429_p2_mixed_quotient_matrix.json",
    matrix_sha256: fixture.matrix_sha256,
    final_hnf_sha256: fixture.final_hnf_sha256,
    rows: fixture.rows,
    columns: fixture.columns,
    batch_size: fixture.batch_size,
    stages,
  },
  exactness: {
    all_prefixes_equal:
      measured.prefix_equalities.length === stages &&
      measured.prefix_equalities.every(Boolean),
    compared_prefixes: measured.prefix_equalities.length,
    final_equal: measured.final_equal,
    frozen_pari_lattice_equal: measured.pari_lattice_equal,
  },
  accounting,
  timing: {
    pinned_cpu_list:
      process.platform === "linux"
        ? readFileSync("/proc/self/status", "utf8").match(
            /^Cpus_allowed_list:\s*(.+)$/mu,
          )?.[1] ?? null
        : null,
    pair_orders: measured.orders,
    baseline_nanoseconds: baseline,
    candidate_nanoseconds: candidate,
    baseline_mean_nanoseconds: baselineMean,
    candidate_mean_nanoseconds: candidateMean,
    candidate_over_baseline:
      baselineMean === null ? null : candidateMean / baselineMean,
  },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

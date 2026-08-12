#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "sagejs-dense-prime-v3-"));
const requestedRuntime = process.argv[2] ?? "all";

const body = String.raw`
def _median(values):
    values.sort()
    return values[len(values) // 2]


def _measure(label, function, samples=5):
    started = _wall_time()
    first_result = function()
    first = 1000 * (_wall_time() - started)
    warm = []
    for _sample in range(samples):
        started = _wall_time()
        result = function()
        warm.append(1000 * (_wall_time() - started))
    print("RESULT", label, round(first, 6), round(_median(warm), 6))
    return first_result


set_random_seed(20260812)
field = GF(97)
values_500 = [index % 97 for index in range(500 * 500)]
left_500 = random_matrix(field, 500)
right_500 = random_matrix(field, 500)
view_list_500 = random_matrix(field, 500)
view_rows_500 = random_matrix(field, 500)
view_columns_500 = random_matrix(field, 500)
format_200 = random_matrix(field, 200)
serialize_500 = random_matrix(field, 500)
multiply_300 = random_matrix(GF(7), 300)
square_300 = random_matrix(field, 300)
polynomial_100 = random_matrix(field, 100)
solve_left_150 = random_matrix(field, 150)
solve_right_150 = random_matrix(field, 150, 16)
wide_200 = random_matrix(field, 200, 300)


def _entry_scan():
    total = 0
    for index in range(500):
        total += int(left_500[index, index].lift())
    return total


def _diagonal_mutation():
    target = left_500.__copy__()
    for index in range(500):
        target[index, index] = index
    return target


_measure("random_500", lambda: random_matrix(field, 500))
_measure("construct_flat_500", lambda: matrix(field, 500, 500, values_500))
_measure("entry_scan_500", _entry_scan)
_measure("mutation_diagonal_500", _diagonal_mutation)
_measure("list_500", view_list_500.list)
_measure("rows_500", view_rows_500.rows)
_measure("columns_500", view_columns_500.columns)
_measure("add_500", lambda: left_500 + right_500)
_measure("subtract_500", lambda: left_500 - right_500)
_measure("negate_500", lambda: -left_500)
_measure("scalar_500", lambda: 13 * left_500)
_measure("transpose_500", left_500.transpose)
_measure("multiply_300", lambda: multiply_300 * multiply_300, 3)
_measure("rank_300", lambda: square_300.__copy__().rank(), 3)
_measure("rref_300", lambda: square_300.__copy__().rref(), 3)
_measure("determinant_300", lambda: square_300.__copy__().det(), 3)
_measure("charpoly_100", lambda: polynomial_100.__copy__().charpoly(), 3)
_measure("minpoly_100", lambda: polynomial_100.__copy__().minpoly(), 3)
_measure(
    "solve_150x16",
    lambda: solve_left_150.__copy__().solve_right(solve_right_150),
    3,
)
_measure(
    "right_kernel_200x300",
    lambda: wide_200.__copy__().right_kernel_matrix(),
    3,
)
_measure("str_200", format_200.str, 3)
payload = _measure("serialize_500", lambda: _dumps(serialize_500), 3)
_measure("deserialize_500", lambda: _loads(payload), 3)
`;

function run(label, command, preamble) {
  // Do not call the Sage benchmark `sage.py`: that shadows Sage's own
  // top-level package when the script evaluates `from sage.all import *`.
  const filename = join(temporary, `${label}-dense-prime-benchmark.py`);
  writeFileSync(filename, `${preamble}\n${body}`);
  const started = performance.now();
  const result = spawnSync(command[0], [...command.slice(1), filename], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
    },
    timeout: 300_000,
  });
  if (result.error) throw result.error;
  process.stdout.write(`\n${label} (process ${(performance.now() - started).toFixed(1)} ms)\n`);
  process.stdout.write(result.stdout);
  if (result.stderr !== "") {
    process.stderr.write(`\n${label} stderr\n${result.stderr}`);
  }
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

try {
  if (requestedRuntime === "all" || requestedRuntime === "sagejs") {
    run("sagejs", [process.execPath, join(root, "bin", "sagejs")], String.raw`
import sagejs.runtime as _runtime
from sagejs_serialization import dumps as _dumps, loads as _loads
_wall_time = _runtime.wall_time
`);
  }

  if (requestedRuntime === "all" || requestedRuntime === "sage") {
    const sage = process.env.SAGE ?? "/opt/cocalc-webdev-python/bin/sage";
    run("sage", [sage], String.raw`
from sage.all import *
from time import perf_counter as _wall_time
_dumps = dumps
_loads = loads
`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

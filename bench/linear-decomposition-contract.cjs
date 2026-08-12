#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const source = String.raw`
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from statistics import median
from time import perf_counter
import json
import platform
import sys

path = Path("src/lib/sagejs/linear_algebra/decompositions.py")
spec = spec_from_file_location("sagejs_linear_decomposition_benchmark", path)
assert spec is not None and spec.loader is not None
module = module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

Matrix = module.RationalMatrixData
size = 40
samples = 7


def measure(function):
    function()
    timings = []
    for _ in range(samples):
        started = perf_counter()
        function()
        timings.append((perf_counter() - started) * 1000)
    return {
        "median_ms": median(timings),
        "minimum_ms": min(timings),
        "samples_ms": timings,
    }


# Diagonal dominance keeps the rational LU benchmark deterministic while
# exercising dense O(n^3) elimination rather than coefficient explosion.
lu_entries = []
for row in range(size):
    for column in range(size):
        if row == column:
            lu_entries.append(101 + row)
        else:
            lu_entries.append(((17 * row + 31 * column + 5) % 7) - 3)
lu_input = Matrix.create(size, size, lu_entries)

# Upper triangular columns have exact positive rational norms after projection,
# so the 40 x 40 QR workload measures the full cubic reference path in QQ.
qr_input = Matrix.from_rows([
    [
        0 if column < row else (row % 5) + 1 if column == row
        else ((11 * row + 7 * column) % 9) - 4
        for column in range(size)
    ]
    for row in range(size)
])

# The corresponding lower-triangular row workload gives a full-rank exact
# Gram-Schmidt decomposition without introducing irrational normalization.
gram_input = Matrix.from_rows([
    [
        0 if column > row else (row % 5) + 1 if column == row
        else ((13 * row + 5 * column) % 9) - 4
        for column in range(size)
    ]
    for row in range(size)
])


def run_lu():
    return module.exact_lu(lu_input)


def run_qr():
    return module.exact_qr(qr_input)


def run_gram():
    return module.gram_schmidt_rows(gram_input)


p, l, u = run_lu()
assert p.multiply(l).multiply(u) == lu_input
q, r = run_qr()
assert q.multiply(r) == qr_input
g, m = run_gram()
assert m.multiply(g) == gram_input

report = {
    "benchmark": "linear-decomposition-reference-contract",
    "matrix": [size, size],
    "samples": samples,
    "python": platform.python_version(),
    "implementation": platform.python_implementation(),
    "lu_partial": measure(run_lu),
    "exact_qr_full": measure(run_qr),
    "gram_schmidt_rows": measure(run_gram),
}
print(json.dumps(report, sort_keys=True))
`;

const result = spawnSync("python3", ["-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
});

if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.equal(result.stderr, "");

const report = JSON.parse(result.stdout);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `40x40 exact reference LU: ${report.lu_partial.median_ms.toFixed(3)} ms median`,
  );
  console.log(
    `40x40 exact reference QR: ${report.exact_qr_full.median_ms.toFixed(3)} ms median`,
  );
  console.log(
    `40x40 exact reference Gram-Schmidt: ${report.gram_schmidt_rows.median_ms.toFixed(3)} ms median`,
  );
}

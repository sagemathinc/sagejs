#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "sagejs-prime-matrix-bench-"));

const source = String.raw`
import sagejs.runtime as runtime


def median(samples):
    samples.sort()
    return samples[len(samples) // 2]


def median_call(function, repeats=7):
    samples = []
    for _repeat in range(repeats):
        started = runtime.wall_time()
        function()
        samples.append(1000 * (runtime.wall_time() - started))
    return median(samples)


def median_first(function, repeats=3):
    sources = [random_matrix(GF(7), 512) for _repeat in range(repeats)]
    samples = []
    for source in sources:
        started = runtime.wall_time()
        function(source)
        samples.append(1000 * (runtime.wall_time() - started))
    return median(samples)


list_first = median_first(lambda source: source.list())
rows_first = median_first(lambda source: source.rows())
columns_first = median_first(lambda source: source.columns())

warm = random_matrix(GF(7), 512)
warm.list()
list_warm = median_call(warm.list)

selector = random_matrix(GF(7), 512)
row_fresh = median_call(lambda: selector.row(123))
column_fresh = median_call(lambda: selector.column(123))
add = median_call(lambda: selector + selector)

print("512x512 dense GF(7), warm process, milliseconds")
print("list first:    " + str(round(list_first, 3)))
print("list warm:     " + str(round(list_warm, 3)))
print("rows first:    " + str(round(rows_first, 3)))
print("columns first: " + str(round(columns_first, 3)))
print("row fresh:     " + str(round(row_fresh, 3)))
print("column fresh:  " + str(round(column_fresh, 3)))
print("addition:      " + str(round(add, 3)))
`;

try {
  const script = join(directory, "benchmark.py");
  writeFileSync(script, source);
  const result = spawnSync(join(root, "bin", "sagejs"), [script], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}

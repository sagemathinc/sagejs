#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const modulePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "linear_algebra",
  "matrix_selection.py",
);

const program = String.raw`
import importlib.util
import json
import time

MODULE_PATH = __MATRIX_SELECTION_PATH__
spec = importlib.util.spec_from_file_location("matrix_selection", MODULE_PATH)
assert spec is not None and spec.loader is not None
selection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selection)


def median_ms(function):
    function()
    samples = []
    for _ in range(7):
        started = time.perf_counter()
        function()
        samples.append((time.perf_counter() - started) * 1000)
    samples.sort()
    return samples[len(samples) // 2]


size = 500
values = list(range(size * size))
rows = tuple(range(0, size, 2))
columns = tuple(range(1, size, 2))
plan = selection.selection_plan(size, size, rows, columns)
selected = selection.select_row_major(values, size, size, plan)
assert len(selected) == len(rows) * len(columns)
assert selected[0] == 1
assert selected[-1] == (size - 2) * size + (size - 1)

row_values = tuple(range(size))
column_values = tuple(range(size))
block_size = 250
block_values = tuple(range(block_size * block_size))


def select_plan():
    return selection.selection_plan(size, size, rows, columns)


def gather():
    return selection.select_row_major(values, size, size, plan)


def set_row():
    target = values.copy()
    update = selection.prepare_row_update(size, size, 250, row_values, int)
    selection.apply_affine_update(target, len(target), update)
    assert target[250 * size : 251 * size] == list(row_values)


def set_column():
    target = values.copy()
    update = selection.prepare_column_update(size, size, 250, column_values, int)
    selection.apply_affine_update(target, len(target), update)
    assert target[250] == 0 and target[-250] == size - 1


def set_block():
    target = values.copy()
    update = selection.prepare_block_update(
        size,
        size,
        125,
        125,
        block_size,
        block_size,
        block_values,
        int,
    )
    selection.apply_block_update(target, size, size, update)
    assert target[125 * size + 125] == 0
    assert target[374 * size + 374] == block_size * block_size - 1


def swap_rows():
    target = values.copy()
    update = selection.prepare_row_swap(size, size, 0, size - 1)
    selection.apply_swap(target, update)
    assert target[0] == (size - 1) * size and target[-1] == size - 1


results = {
    "selection_plan_500_ms": median_ms(select_plan),
    "gather_250x250_from_500_ms": median_ms(gather),
    "set_row_500_ms": median_ms(set_row),
    "set_column_500_ms": median_ms(set_column),
    "set_block_250x250_in_500_ms": median_ms(set_block),
    "swap_rows_500_ms": median_ms(swap_rows),
}
print(json.dumps(results, sort_keys=True))
`.replace("__MATRIX_SELECTION_PATH__", JSON.stringify(modulePath));

function run() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-matrix-selection-bench-"));
  try {
    const script = join(directory, "benchmark.py");
    writeFileSync(script, program);
    const executable = process.platform === "win32" ? "python" : "python3";
    const result = spawnSync(executable, [script], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `Python exited ${result.status}`);
    }
    return JSON.parse(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const budgets = {
  selection_plan_500_ms: 10,
  gather_250x250_from_500_ms: 30,
  set_row_500_ms: 20,
  set_column_500_ms: 20,
  set_block_250x250_in_500_ms: 50,
  swap_rows_500_ms: 20,
};

const results = run();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ size: 500, results, budgets }, null, 2));
} else {
  console.log("Storage-neutral matrix selection (CPython reference, 500x500)");
  for (const [name, milliseconds] of Object.entries(results)) {
    console.log(`  ${name.padEnd(35)} ${milliseconds.toFixed(3)} ms`);
  }
}

if (process.argv.includes("--check")) {
  for (const [name, budget] of Object.entries(budgets)) {
    if (results[name] > budget) {
      throw new Error(`${name} took ${results[name].toFixed(3)} ms (budget ${budget})`);
    }
  }
}

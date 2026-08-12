#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

const program = String.raw`
from time import perf_counter


def median_ms(function):
    function()
    samples = []
    for _repeat in range(5):
        started = perf_counter()
        function()
        samples.append((perf_counter() - started) * 1000)
    samples.sort()
    return samples[len(samples) // 2]


size = 500
rows = tuple(range(0, size, 2))
columns = tuple(range(1, size, 2))
for name, base in [("ZZ", ZZ), ("QQ", QQ), ("GF2", GF(2)), ("GF97", GF(97))]:
    source = matrix(base, size, size, [index % 97 for index in range(size * size)])
    target = source.__copy__()
    row_values = source.row(3).list()
    column_values = source.column(3).list()
    block = source.submatrix(0, 0, 96, 96)

    def select():
        answer = source.matrix_from_rows_and_columns(rows, columns)
        assert answer.dimensions() == (250, 250)

    def submatrix():
        answer = source.submatrix(125, 125, 250, 250)
        assert answer.dimensions() == (250, 250)

    def swap_rows():
        target.swap_rows(0, size - 1)

    def swap_columns():
        target.swap_columns(0, size - 1)

    def set_row():
        target.set_row(123, row_values)

    def set_column():
        target.set_column(234, column_values)

    def set_block():
        target.set_block(200, 300, block)

    timings = [
        median_ms(select),
        median_ms(submatrix),
        median_ms(swap_rows),
        median_ms(swap_columns),
        median_ms(set_row),
        median_ms(set_column),
        median_ms(set_block),
    ]
    print(name, *timings)

integer = matrix(ZZ, size, size, [index % 97 for index in range(size * size)])
print("ZZ_INSERT", median_ms(lambda: integer.insert_row(250, range(size))))

# Preserve an explicit scaling history for the current storage-replacement
# swaps.  A follow-up lane will replace these O(n^2) square-matrix paths with
# direct O(n) generated FLINT/M4RI/packed-storage operations.
for name, base in [("ZZ", ZZ), ("QQ", QQ), ("GF2", GF(2)), ("GF97", GF(97))]:
    for scale in [128, 256, 512]:
        target = matrix(
            base,
            scale,
            scale,
            [index % 97 for index in range(scale * scale)],
        )
        row_ms = median_ms(lambda: target.swap_rows(0, scale - 1))
        column_ms = median_ms(lambda: target.swap_columns(0, scale - 1))
        print("SWAP_SCALE", name, scale, row_ms, column_ms)
`;

function run() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-public-selection-bench-"));
  try {
    const script = join(directory, "benchmark.py");
    writeFileSync(script, program);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, SAGEJS_FORBID_MATRIX_NAPI: "1" },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `Sage.js exited ${result.status}`);
    }
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const names = [
  "select_250x250_ms",
  "submatrix_250x250_ms",
  "swap_rows_ms",
  "swap_columns_ms",
  "set_row_ms",
  "set_column_ms",
  "set_block_96x96_ms",
];
const results = {};
const swapScaling = {};
for (const line of run().split("\n")) {
  const fields = line.trim().split(/\s+/);
  if (fields[0] === "SWAP_SCALE") {
    const domain = fields[1];
    const size = fields[2];
    swapScaling[domain] ??= {};
    swapScaling[domain][size] = {
      swap_rows_ms: Number(fields[3]),
      swap_columns_ms: Number(fields[4]),
    };
    continue;
  }
  if (fields[0] === "ZZ_INSERT") {
    results.ZZ_INSERT = { insert_row_ms: Number(fields[1]) };
    continue;
  }
  const measurements = fields.slice(1).map(Number);
  results[fields[0]] = Object.fromEntries(
    names.map((name, index) => [name, measurements[index]]),
  );
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ size: 500, results, swapScaling }, null, 2));
} else {
  console.log("Public matrix selection and mutation (500x500)");
  for (const [domain, timings] of Object.entries(results)) {
    console.log(`  ${domain}`);
    for (const [name, milliseconds] of Object.entries(timings)) {
      console.log(`    ${name.padEnd(28)} ${milliseconds.toFixed(3)} ms`);
    }
  }
  console.log("  swap scaling (square matrices)");
  for (const [domain, sizes] of Object.entries(swapScaling)) {
    for (const [size, timings] of Object.entries(sizes)) {
      console.log(
        `    ${domain.padEnd(4)} ${size.padStart(4)} ` +
          `rows=${timings.swap_rows_ms.toFixed(3)} ms ` +
          `columns=${timings.swap_columns_ms.toFixed(3)} ms`,
      );
    }
  }
}

if (process.argv.includes("--check")) {
  for (const [domain, timings] of Object.entries(results)) {
    for (const [name, milliseconds] of Object.entries(timings)) {
      const budget = name === "set_block_96x96_ms" ? 50 : 75;
      if (!Number.isFinite(milliseconds) || milliseconds > budget) {
        throw new Error(
          `${domain} ${name} took ${milliseconds.toFixed(3)} ms (budget ${budget})`,
        );
      }
    }
  }
  for (const [domain, sizes] of Object.entries(swapScaling)) {
    for (const [size, timings] of Object.entries(sizes)) {
      for (const [name, milliseconds] of Object.entries(timings)) {
        if (!Number.isFinite(milliseconds) || milliseconds > 100) {
          throw new Error(
            `${domain} ${size} ${name} took ${milliseconds.toFixed(3)} ms`,
          );
        }
      }
    }
  }
}

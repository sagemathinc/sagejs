#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "sagejs-prime-batch-bench-"));
const script = join(directory, "bench.py");
writeFileSync(
  script,
  String.raw`
from time import perf_counter


def median(values):
    return sorted(values)[len(values) // 2]


def timed(function, repeats=5):
    samples = []
    for _repeat in range(repeats):
        start = perf_counter()
        function()
        samples.append(perf_counter() - start)
    return median(samples)


size = 512
block_size = 96
for prime in [2, 97, 65521]:
    field = GF(prime)
    target = matrix(field, size, size, 0)
    row_values = [field((37 * index + 11) % prime) for index in range(size)]
    column_values = [field((53 * index + 19) % prime) for index in range(size)]
    block = matrix(
        field,
        block_size,
        block_size,
        [(17 * index + 5) % prime for index in range(block_size * block_size)],
    )

    def scalar_row():
        for column in range(size):
            target[123, column] = row_values[column]

    def scalar_column():
        for row in range(size):
            target[row, 234] = column_values[row]

    def scalar_block():
        for row in range(block_size):
            for column in range(block_size):
                target[200 + row, 300 + column] = block[row, column]

    def batch_row():
        target.set_row(123, row_values)

    def batch_column():
        target.set_column(234, column_values)

    def batch_block():
        target.set_block(200, 300, block)

    print(
        prime,
        timed(scalar_row, 3) * 1000,
        timed(batch_row, 7) * 1000,
        timed(scalar_column, 3) * 1000,
        timed(batch_column, 7) * 1000,
        timed(scalar_block, 3) * 1000,
        timed(batch_block, 7) * 1000,
    )
`,
);
const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
  cwd: root,
  encoding: "utf8",
});
rmSync(directory, { recursive: true, force: true });

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;

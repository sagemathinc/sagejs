#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "sagejs-prime-boundary-bench-"));
const script = join(directory, "bench.py");
writeFileSync(
  script,
  String.raw`
from time import perf_counter


def median(values):
    return sorted(values)[len(values) // 2]


def timed(function, repeats):
    samples = []
    for _repeat in range(repeats):
        start = perf_counter()
        function()
        samples.append(perf_counter() - start)
    return median(samples)


for prime in [2, 97, 65521]:
    field = GF(prime)
    set_random_seed(20260812 + prime)
    source = random_matrix(field, 200, 240)
    reads = 10000

    def read_entries():
        value = source[0, 0]
        for index in range(reads):
            value = source[index % 200, (index * 37) % 240]
        return value

    source[17, 31]
    read_us = timed(read_entries, 5) * 1000000 / reads
    writes = 1000

    def write_entries():
        for index in range(writes):
            source[index % 200, (index * 37) % 240] = field(index)

    write_us = timed(write_entries, 5) * 1000000 / writes
    reduced = source.rref()
    pivot_scan_ms = timed(lambda: reduced.pivots(), 1) * 1000
    cached_pivot_us = timed(lambda: reduced.pivots(), 100) * 1000000
    entries = source.list()
    rref_ms = timed(lambda: matrix(field, 200, 240, entries).rref(), 5) * 1000
    fresh_pivot_ms = (
        timed(lambda: matrix(field, 200, 240, entries).pivots(), 5) * 1000
    )
    print(
        prime,
        read_us,
        write_us,
        pivot_scan_ms,
        cached_pivot_us,
        rref_ms,
        fresh_pivot_ms,
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

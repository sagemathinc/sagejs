#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "sagejs-exact-view-bench-"));
const script = join(directory, "benchmark.py");

writeFileSync(script, String.raw`
import sagejs.runtime as runtime

def measure(function, rounds=5):
    samples = []
    for _round in range(rounds):
        start = runtime.wall_time()
        function()
        samples.append(1000 * (runtime.wall_time() - start))
    samples.sort()
    return samples[len(samples) // 2]

for base in [ZZ, QQ]:
    source = random_matrix(base, 300, 300)
    operations = [
        ('rows-first', lambda: source.rows(), 1),
        ('rows-cached', lambda: source.rows(), 7),
        ('columns-from-rows', lambda: source.columns(), 1),
        ('columns-cached', lambda: source.columns(), 7),
        ('row', lambda: source.row(100), 7),
        ('column', lambda: source.column(100), 7),
        ('diagonal', lambda: source.diagonal(), 7),
        ('list-from-cache', lambda: source.list(), 7),
    ]
    for name, function, rounds in operations:
        print(str(base) + '\t' + name + '\t' + str(measure(function, rounds)))
`);

try {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), script],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  process.stdout.write("runtime\tbase\toperation\tmedian_ms\n");
  for (const line of result.stdout.trim().split("\n")) {
    process.stdout.write(`sagejs\t${line}\n`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

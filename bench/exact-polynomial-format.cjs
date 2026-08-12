#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = [
  "import time",
  "def median(values):",
  "    values = sorted(values)",
  "    return values[len(values) // 2]",
  "def sample(value):",
  "    repr(value)",
  "    timings = []",
  "    for _ in range(3):",
  "        started = time.perf_counter()",
  "        text = repr(value)",
  "        timings.append(1000 * (time.perf_counter() - started))",
  "    return median(timings), len(text)",
  "for count in [10000, 50000]:",
  "    integer_ring = PolynomialRing(ZZ, 'zeta')",
  "    integer = integer_ring([(-1)**index * (index + 1) for index in range(count)])",
  "    rational_ring = PolynomialRing(QQ, 'theta')",
  "    rational = rational_ring([QQ((-1)**index * (index + 1), index % 7 + 1) for index in range(count)])",
  "    zz_ms, zz_length = sample(integer)",
  "    qq_ms, qq_length = sample(rational)",
  "    print(count, zz_ms, qq_ms, zz_length, qq_length)",
  "",
].join("\n");

const result = spawnSync(process.execPath, [resolve(root, "bin", "sagejs"), "--python"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1" },
});
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);

const lines = result.stdout.trim().split("\n").map((line) => line.trim().split(/\s+/));
assert.equal(lines.length, 2, result.stdout);
const measurements = Object.fromEntries(lines.map((fields) => {
  assert.equal(fields.length, 5, fields.join(" "));
  const count = Number(fields[0]);
  return [count, {
    zzMilliseconds: Number(fields[1]),
    qqMilliseconds: Number(fields[2]),
    zzLength: Number(fields[3]),
    qqLength: Number(fields[4]),
  }];
}));

// Before the bulk resource formatter, representative degree-20k medians were
// about 89 ms over ZZ and 309 ms over QQ on the development host. These gates
// cover substantially larger output while tolerating shared CI contention.
assert.ok(measurements[10000].zzMilliseconds < 100,
  `degree-10k ZZ formatting took ${measurements[10000].zzMilliseconds} ms`);
assert.ok(measurements[10000].qqMilliseconds < 100,
  `degree-10k QQ formatting took ${measurements[10000].qqMilliseconds} ms`);
assert.ok(measurements[50000].zzMilliseconds < 350,
  `degree-50k ZZ formatting took ${measurements[50000].zzMilliseconds} ms`);
assert.ok(measurements[50000].qqMilliseconds < 350,
  `degree-50k QQ formatting took ${measurements[50000].qqMilliseconds} ms`);
assert.ok(measurements[50000].zzLength > 900000);
assert.ok(measurements[50000].qqLength > 1000000);

console.log(JSON.stringify({
  schema: "sagejs.benchmark/exact-polynomial-format-v1",
  measurements,
}));

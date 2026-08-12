#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = [
  "import time",
  "results = []",
  "for base in [ZZ, QQ, GF(1009)]:",
  "    ring = PolynomialRing(base, 'x')",
  "    if base is QQ:",
  "        left = ring([QQ((i*17)%31-15, i%7+1) for i in range(401)])",
  "        right = ring([QQ((i*13)%29-14, i%5+1) for i in range(101)])",
  "    else:",
  "        left = ring([(i*17)%31-15 for i in range(401)])",
  "        right = ring([(i*13)%29-14 for i in range(101)])",
  "    quotient, remainder = left.quo_rem(right)",
  "    samples = []",
  "    for repeat in range(7):",
  "        started = time.perf_counter()",
  "        quotient, remainder = left.quo_rem(right)",
  "        samples.append(1000*(time.perf_counter() - started))",
  "    samples.sort()",
  "    assert quotient*right + remainder == left",
  "    results.append(samples[3])",
  "print(*results)",
  "",
].join("\n");

const result = spawnSync(
  process.execPath,
  [resolve(root, "bin", "sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1" },
  },
);
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
const [integer, rational, prime] = result.stdout.trim().split(/\s+/).map(Number);
for (const value of [integer, rational, prime]) assert.ok(Number.isFinite(value));

// These gates catch accidental coefficient-by-coefficient host arithmetic or
// repeated exact division while leaving ample room for shared CI machines.
assert.ok(integer < 250, `ZZ[x] quo_rem took ${integer} ms`);
assert.ok(rational < 250, `QQ[x] quo_rem took ${rational} ms`);
assert.ok(prime < 100, `GF(p)[x] quo_rem took ${prime} ms`);

console.log(JSON.stringify({
  schema: "sagejs.benchmark/polynomial-core-correctness-v1",
  dividendDegree: 400,
  divisorDegree: 100,
  milliseconds: { integer, rational, prime },
}, null, 2));

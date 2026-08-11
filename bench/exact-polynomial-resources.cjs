#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = [
  "import time",
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "t = time.perf_counter(); f = (x + 1)**5000; zz_pow = time.perf_counter() - t",
  "t = time.perf_counter(); zv = f(2); zz_eval = time.perf_counter() - t",
  "t = time.perf_counter(); ze = (f == f); zz_equal = time.perf_counter() - t",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "t = time.perf_counter(); q = (y + QQ(1)/QQ(2))**2000; qq_pow = time.perf_counter() - t",
  "t = time.perf_counter(); qv = q(QQ(2)/QQ(3)); qq_eval = time.perf_counter() - t",
  "t = time.perf_counter(); text = str(q); qq_str = time.perf_counter() - t",
  "serialized = dumps(q); warm = loads(serialized)",
  "t = time.perf_counter(); serialized = dumps(q); qq_dump = time.perf_counter() - t",
  "t = time.perf_counter(); restored = loads(serialized); qq_load = time.perf_counter() - t",
  "t = time.perf_counter(); skew = R([0 for i in range(20000)] + [2**8192 + 1]); skew_construct = time.perf_counter() - t",
  "print(zz_pow, zz_eval, zz_equal, qq_pow, qq_eval, qq_str, qq_dump, qq_load, skew_construct, len(text), len(serialized), zv % 1000003, qv.numerator() % 1000003, qv.denominator() % 1000003, ze, restored._has_fmpq_polynomial_resource())",
  "",
].join("\n");

const started = performance.now();
const result = spawnSync(process.execPath, [resolve(root, "bin", "sagejs"), "--python"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1" },
});
const coldMilliseconds = performance.now() - started;
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);

const fields = result.stdout.trim().split(/\s+/);
assert.equal(fields.length, 16, result.stdout);
const [
  zzPow,
  zzEval,
  zzEqual,
  qqPow,
  qqEval,
  qqStr,
  qqDump,
  qqLoad,
  skewConstruct,
] = fields.slice(0, 9).map((value) => 1000 * Number(value));
const textLength = Number(fields[9]);
const serializedLength = Number(fields[10]);
assert.equal(fields[14], "True");
assert.equal(fields[15], "True");
assert.ok(textLength > 1_000_000);
assert.ok(serializedLength > 100_000);

// These generous gates reject boundary regressions by orders of magnitude,
// while tolerating shared CI hosts. They are not claims about absolute speed.
assert.ok(coldMilliseconds < 5_000, `cold process took ${coldMilliseconds} ms`);
assert.ok(zzPow < 500, `ZZ[x] pow took ${zzPow} ms`);
assert.ok(zzEval < 100, `ZZ[x] evaluation took ${zzEval} ms`);
assert.ok(zzEqual < 500, `ZZ[x] equality took ${zzEqual} ms`);
assert.ok(qqPow < 250, `QQ[x] pow took ${qqPow} ms`);
assert.ok(qqEval < 100, `QQ[x] evaluation took ${qqEval} ms`);
assert.ok(qqStr < 1_000, `QQ[x] formatting took ${qqStr} ms`);
assert.ok(qqDump < 250, `QQ[x] SagePack encoding took ${qqDump} ms`);
assert.ok(qqLoad < 750, `QQ[x] SagePack decoding took ${qqLoad} ms`);
assert.ok(skewConstruct < 1_000, `skewed construction took ${skewConstruct} ms`);

console.log(JSON.stringify({
  schema: "sagejs.benchmark/exact-polynomial-resources-v1",
  coldMilliseconds,
  milliseconds: {
    zzPow,
    zzEval,
    zzEqual,
    qqPow,
    qqEval,
    qqStr,
    qqDump,
    qqLoad,
    skewConstruct,
  },
  textLength,
  serializedLength,
}));

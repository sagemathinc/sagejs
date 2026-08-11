#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = [
  "import time",
  "R = PolynomialRing(ZZ, 'x')",
  "zvalues = [(index % 97) - 48 for index in range(20001)]",
  "zwarm = R(zvalues)",
  "zz_construct = []",
  "zz_export = []",
  "for sample in range(3):",
  "    started = time.perf_counter()",
  "    z = R(zvalues)",
  "    zz_construct.append(1000 * (time.perf_counter() - started))",
  "    started = time.perf_counter()",
  "    zcoefficients = z.coefficients()",
  "    zz_export.append(1000 * (time.perf_counter() - started))",
  "huge = 2**65537 + 1",
  "started = time.perf_counter()",
  "zskew = R([1, huge, 0, 0])",
  "zz_skew_construct = 1000 * (time.perf_counter() - started)",
  "started = time.perf_counter()",
  "zskew_coefficients = zskew.coefficients()",
  "zz_skew_export = 1000 * (time.perf_counter() - started)",
  "S = PolynomialRing(QQ, 'y')",
  "qvalues = [QQ((index % 97) - 48) / QQ((index % 13) + 1) for index in range(10001)]",
  "qwarm = S(qvalues)",
  "qq_construct = []",
  "qq_export = []",
  "for sample in range(3):",
  "    started = time.perf_counter()",
  "    q = S(qvalues)",
  "    qq_construct.append(1000 * (time.perf_counter() - started))",
  "    started = time.perf_counter()",
  "    qcoefficients = q.coefficients()",
  "    qq_export.append(1000 * (time.perf_counter() - started))",
  "started = time.perf_counter()",
  "qskew = S([QQ(huge) / QQ(2**32771 + 1), 0, 0])",
  "qq_skew_construct = 1000 * (time.perf_counter() - started)",
  "started = time.perf_counter()",
  "qskew_coefficients = qskew.coefficients()",
  "qq_skew_export = 1000 * (time.perf_counter() - started)",
  "zz_construct.sort()",
  "zz_export.sort()",
  "qq_construct.sort()",
  "qq_export.sort()",
  "print(zz_construct[1], zz_export[1], qq_construct[1], qq_export[1], zz_skew_construct, zz_skew_export, qq_skew_construct, qq_skew_export, len(zcoefficients), len(qcoefficients), zskew_coefficients == [1, huge], qskew_coefficients == [QQ(huge) / QQ(2**32771 + 1)])",
  "",
].join("\n");

const started = performance.now();
const result = spawnSync(
  process.execPath,
  [resolve(root, "bin", "sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1" },
    timeout: 120_000,
  },
);
const processMilliseconds = performance.now() - started;
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.equal(result.stderr, "");
const fields = result.stdout.trim().split(/\s+/);
assert.equal(fields.length, 12, result.stdout);
const milliseconds = fields.slice(0, 8).map(Number);
const [
  zzConstruct,
  zzExport,
  qqConstruct,
  qqExport,
  zzSkewConstruct,
  zzSkewExport,
  qqSkewConstruct,
  qqSkewExport,
] = milliseconds;
assert.deepEqual(fields.slice(8), ["20001", "10001", "True", "True"]);

// These bounds reject a return to coefficient-at-a-time FFI while allowing a
// heavily shared CI host. They are not absolute performance claims.
assert.ok(zzConstruct < 80, `ZZ construction took ${zzConstruct} ms`);
assert.ok(zzExport < 60, `ZZ export took ${zzExport} ms`);
assert.ok(qqConstruct < 50, `QQ construction took ${qqConstruct} ms`);
assert.ok(qqExport < 70, `QQ export took ${qqExport} ms`);
assert.ok(zzSkewConstruct < 100, `skew ZZ construction took ${zzSkewConstruct} ms`);
assert.ok(zzSkewExport < 100, `skew ZZ export took ${zzSkewExport} ms`);
assert.ok(qqSkewConstruct < 100, `skew QQ construction took ${qqSkewConstruct} ms`);
assert.ok(qqSkewExport < 100, `skew QQ export took ${qqSkewExport} ms`);

const scalarBaselineMilliseconds = {
  zzConstruct: 118.4,
  zzExport: 107.3,
  qqConstruct: 59.3,
  qqExport: 98.6,
};
console.log(JSON.stringify({
  schema: "sagejs.benchmark/exact-polynomial-bulk-io-v1",
  workload: {
    zzDegree: 20_000,
    qqDegree: 10_000,
    skewBits: 65_538,
    samples: 3,
  },
  milliseconds: {
    zzConstruct,
    zzExport,
    qqConstruct,
    qqExport,
    zzSkewConstruct,
    zzSkewExport,
    qqSkewConstruct,
    qqSkewExport,
    process: processMilliseconds,
  },
  previousScalarBoundaryMilliseconds: scalarBaselineMilliseconds,
  speedup: {
    zzConstruct: scalarBaselineMilliseconds.zzConstruct / zzConstruct,
    zzExport: scalarBaselineMilliseconds.zzExport / zzExport,
    qqConstruct: scalarBaselineMilliseconds.qqConstruct / qqConstruct,
    qqExport: scalarBaselineMilliseconds.qqExport / qqExport,
  },
}));

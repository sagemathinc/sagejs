#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { cpus, tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform === "win32") {
  throw new Error("run the lifecycle test for Windows compilation; this benchmark is Unix-only");
}

const root = resolve(__dirname, "..");
const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX ||
  join(root, "packages", "flint", ".native", "prefix"));
const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-order-bench-"));
const source = join(temporary, "witness.c");
const executable = join(temporary, "witness");
const rounds = Number(process.argv[2] || 100);
assert(Number.isSafeInteger(rounds) && rounds > 0);

try {
  writeFileSync(source, readFileSync(join(
    root,
    "packages",
    "flint",
    "test",
    "number_field_order_resource_ffi.c",
  )));
  const libraries = [
    "libflint.a",
    "libopenblas.a",
    "libmpc.a",
    "libmpfr.a",
    "libgmp.a",
  ].map((name) => join(prefix, "lib", name));
  const compile = spawnSync(process.env.CC || "cc", [
    "-std=c11",
    "-O3",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    source,
    ...libraries,
    "-lm",
    "-lpthread",
    "-o",
    executable,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);
  const samples = [];
  let native;
  for (let sample = 0; sample < 9; sample++) {
    const executed = spawnSync(executable, ["--benchmark", String(rounds)], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
    native = JSON.parse(executed.stdout);
    samples.push(native.meanUs);
  }
  samples.sort((left, right) => left - right);
  const medianUs = samples[Math.floor(samples.length / 2)];
  const planWarmPublicBaselineMs = 62.7;
  process.stdout.write(`${JSON.stringify({
    ...native,
    sampleCount: samples.length,
    rawMeanUs: samples,
    medianUs,
    planWarmPublicBaselineMs,
    boundaryVsPlanPublicBaselineSpeedup: planWarmPublicBaselineMs * 1000 / medianUs,
    commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    cpu: cpus()[0]?.model || "unknown",
    compiler: spawnSync(process.env.CC || "cc", ["--version"], { encoding: "utf8" })
      .stdout.split("\n")[0],
    workload: "monic x^7 - 2*x + 3 with exact hints 2,3,5,7,11; eight warmups per sample",
    boundary: "sealed canonical fmpz polynomial plus fmpz prime-hint matrix to compact HNF bytes",
    comparisonCaveat: "the 62.7 ms plan baseline is the old warm public path, not this isolated native boundary",
  })}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  rmSync,
} = require("node:fs");
const { cpus, loadavg, release, tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

if (process.platform === "win32") {
  throw new Error(
    "the differential suite covers Windows; this timing witness is Unix-only",
  );
}

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const sourcePath = join(__dirname, "native_live_exact_vector.py");
const referencePath = join(__dirname, "native-live-exact-vector-reference.c");
const repetitions = Number(
  process.env.SAGEJS_LIVE_VECTOR_REPETITIONS || 100000,
);
const samples = Number(process.env.SAGEJS_LIVE_VECTOR_SAMPLES || 9);
const warmups = Number(process.env.SAGEJS_LIVE_VECTOR_WARMUPS || 3);
assert(Number.isSafeInteger(repetitions) && repetitions > 0);
assert(Number.isSafeInteger(samples) && samples >= 3);
assert(Number.isSafeInteger(warmups) && warmups >= 0);

function run(command, args, timeout = 120000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
    },
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measure(operation) {
  const timings = [];
  let result;
  for (let sample = 0; sample < warmups + samples; sample += 1) {
    const start = performance.now();
    result = operation();
    const elapsed = (performance.now() - start) / 1000;
    if (sample >= warmups) timings.push(elapsed);
  }
  return { medianSeconds: median(timings), result };
}

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-live-vector-bench-"));
  try {
    const executable = join(temporary, "direct-live-vector");
    run(process.env.CC || "cc", [
      "-std=c11",
      "-O3",
      "-Wall",
      "-Wextra",
      "-Werror",
      `-I${join(prefix, "include")}`,
      referencePath,
      join(prefix, "lib", "libgmp.a"),
      "-lm",
      "-o",
      executable,
    ]);
    const direct = JSON.parse(run(executable, [
      String(repetitions),
      String(samples),
      String(warmups),
    ]));
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "native-cache"),
    });
    const module = require(compiled.modulePath);
    const seed = -(1n << 300n);
    const left = (1n << 257n) + 17n;
    const right = -(1n << 199n) + 3n;
    const exactRepetitions = BigInt(repetitions);
    const expected = seed + exactRepetitions * left * right;
    const native = measure(() => module.live_addmul(
      1n,
      4096n,
      seed,
      left,
      right,
      exactRepetitions,
    ));
    const javascript = measure(() => module.live_addmul.javascript(
      1n,
      4096n,
      seed,
      left,
      right,
      exactRepetitions,
    ));
    assert.equal(native.result, expected);
    assert.equal(javascript.result, expected);
    assert.equal(BigInt(direct.result), expected);
    const memory = process.memoryUsage();
    const resources = process.resourceUsage();
    const report = {
      schema: "sagejs-native-live-exact-vector-benchmark-v2",
      revision: run("git", ["rev-parse", "HEAD"]),
      platform: process.platform,
      architecture: process.arch,
      kernel: release(),
      cpu: cpus()[0]?.model || "unknown",
      loadAverage: loadavg(),
      repetitions,
      samples,
      warmups,
      directC: direct,
      generatedNative: {
        medianSeconds: native.medianSeconds,
        ratioToDirect: native.medianSeconds / direct.medianSeconds,
      },
      generatedJavaScript: {
        medianSeconds: javascript.medianSeconds,
        ratioToDirect: javascript.medianSeconds / direct.medianSeconds,
      },
      result: expected.toString(),
      boundaries: {
        directC: "lexical mpz init, addmul loop, result copy, and clear",
        generatedNative:
          "argument validation, one native entry, lexical vector, result publication",
        generatedJavaScript:
          "argument validation, lexical BigInt vector, result publication",
      },
      memory: {
        logicalCapacity: 1,
        semanticMemoryLimitBytes: 4096,
        initializedExactEntriesPerCall: 1,
        deterministicCloseCompleted: true,
        processRssBytesAfterCalls: memory.rss,
        javascriptHeapUsedBytesAfterCalls: memory.heapUsed,
        javascriptExternalBytesAfterCalls: memory.external,
        arrayBufferBytesAfterCalls: memory.arrayBuffers,
        processMaxRssKiB: resources.maxRSS,
      },
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.argv.includes("--check")) {
      assert(
        report.generatedNative.ratioToDirect <= 1.5,
        `generated live vector is ${report.generatedNative.ratioToDirect.toFixed(3)}x direct C`,
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

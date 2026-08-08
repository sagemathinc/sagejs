#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { compile } = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
const sourcePath = join(__dirname, "native_integer_kernel.py");
const workloadPath = join(__dirname, "native_integer_workload.py");
const terms = Number(process.env.SAGEJS_NATIVE_INTEGER_TERMS || 1_000_000);
const nativeRepetitions = Number(
  process.env.SAGEJS_NATIVE_INTEGER_NATIVE_REPETITIONS || 25,
);
const referenceRepetitions = Number(
  process.env.SAGEJS_NATIVE_INTEGER_REPETITIONS || 5,
);
const json = process.argv.includes("--json");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measure(runtime, operation, repetitions, samples = 7) {
  for (let warmup = 0; warmup < 3; warmup += 1) operation();
  const timings = [];
  let value;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    for (let repetition = 0; repetition < repetitions; repetition += 1)
      value = operation();
    timings.push((performance.now() - started) / repetitions);
  }
  return { runtime, value: String(value), milliseconds: median(timings) };
}

function reference(runtime, command, args, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnvironment,
      SAGEJS_NATIVE_AUTOLOAD: "0",
      SAGEJS_NATIVE_INTEGER_TERMS: String(terms),
      SAGEJS_NATIVE_INTEGER_REPETITIONS: String(referenceRepetitions),
      SAGEJS_NATIVE_INTEGER_WARMUPS: "2",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${runtime} exited with status ${result.status}`);
  }
  const match = result.stdout.match(/^RESULT\s+(-?[0-9]+)\s+(\S+)$/m);
  assert(match, `${runtime} produced unexpected output: ${result.stdout}`);
  return {
    runtime,
    value: match[1],
    milliseconds: Number(match[2]) * 1000,
  };
}

(async () => {
  const generated = await compile({
    sourcePath,
    cacheRoot: join(__dirname, ".native-integer-cache"),
  });
  const kernel = require(generated.modulePath);
  const native = measure(
    "Sage.js AOT/GMP",
    () => kernel.integer_quadratic_sum(terms),
    nativeRepetitions,
  );
  const javascript = measure(
    "generated BigInt fallback",
    () => kernel.integer_quadratic_sum.javascript(terms),
    Math.max(1, Math.floor(nativeRepetitions / 5)),
  );
  const cpython = reference("CPython", process.env.PYTHON || "python3", [
    workloadPath,
  ], {
    SAGEJS_NATIVE_SOURCE_ROOT: root,
  });
  const sagejs = reference("Sage.js Python", process.execPath, [
    join(root, "bin", "sagejs-source.cjs"),
    "--python",
    workloadPath,
  ], { SAGEJS_SITE_PACKAGES: __dirname });
  const rows = [native, javascript, cpython, sagejs];
  for (const row of rows) assert.equal(row.value, native.value);
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpus: os.cpus().length,
    },
    workload: `${terms}-term exact quadratic integer sum`,
    cacheKey: generated.cacheKey,
    cached: generated.cached,
    rows: rows.map((row) => ({
      ...row,
      versusAot: row.milliseconds / native.milliseconds,
    })),
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(report.workload);
  console.log("runtime".padEnd(28), "median/call".padStart(14), "versus AOT".padStart(12));
  console.log("-".repeat(56));
  for (const row of report.rows) {
    console.log(
      row.runtime.padEnd(28),
      `${row.milliseconds.toFixed(3)} ms`.padStart(14),
      `${row.versusAot.toFixed(1)}x`.padStart(12),
    );
  }
  console.log(`result: ${native.value}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

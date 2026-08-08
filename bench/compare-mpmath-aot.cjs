#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const flint = require("../packages/flint");

const root = join(__dirname, "..");
const sourcePath = join(__dirname, "native-mpmath-kernel.sage");
const referencePath = join(__dirname, "mpmath-harmonic-workload.py");
const python = process.env.PYTHON || "python3";
const terms = Number(process.env.SAGEJS_MPMATH_AOT_TERMS || 400);
const nativeRepetitions = Number(
  process.env.SAGEJS_MPMATH_AOT_NATIVE_REPETITIONS || 2000,
);
const nativeSamples = Number(
  process.env.SAGEJS_MPMATH_AOT_NATIVE_SAMPLES || 7,
);
const referenceRepetitions = Number(
  process.env.SAGEJS_MPMATH_AOT_REPETITIONS || 20,
);
const json = process.argv.includes("--json");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function reference(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_MPMATH_AOT_TERMS: String(terms),
      SAGEJS_MPMATH_AOT_WARMUPS: "5",
      SAGEJS_MPMATH_AOT_REPETITIONS: String(referenceRepetitions),
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${label} exited with status ${result.status}`);
  }
  const match = result.stdout.match(/^RESULT\s+(\S+)\s+(\S+)$/m);
  assert(match, `${label} produced unexpected output: ${result.stdout}`);
  return {
    runtime: label,
    value: match[1],
    milliseconds: Number(match[2]) * 1000,
  };
}

(async () => {
  const generated = await compileKernel({
    sourcePath,
    cacheRoot: join(__dirname, ".native-mpmath-cache"),
  });
  const addon = require(generated.addonPath);
  const native = addon.harmonic_cubic_loop;
  const precision = 269; // mp.dps = 80, including mpmath's guard bits.

  for (let warmup = 0; warmup < 100; warmup += 1)
    native(precision, terms);
  const nativeTimings = [];
  let nativeAnswer;
  for (let sample = 0; sample < nativeSamples; sample += 1) {
    const started = performance.now();
    for (let iteration = 0; iteration < nativeRepetitions; iteration += 1)
      nativeAnswer = native(precision, terms);
    nativeTimings.push(
      (performance.now() - started) / nativeRepetitions,
    );
  }

  const cpython = reference("CPython mpmath", python, [referencePath]);
  const sagejs = reference("Sage.js mpmath", process.execPath, [
    join(root, "bin", "sagejs-source.cjs"),
    "--python",
    referencePath,
  ]);
  const nativeValue = flint.realToString(nativeAnswer);
  assert.equal(sagejs.value, cpython.value, "mpmath runtimes disagree");
  assert(
    nativeValue.startsWith(cpython.value),
    `AOT MPFR result disagrees: ${nativeValue} versus ${cpython.value}`,
  );

  const aot = {
    runtime: "Sage.js AOT/MPFR",
    value: cpython.value,
    milliseconds: median(nativeTimings),
  };
  const rows = [aot, cpython, sagejs];
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpus: os.cpus().length,
    },
    workload: `${terms}-term harmonic cubic sum at 80 decimal digits`,
    source: "ordinary @native Sage.js lowered through Native Kernel v3",
    cacheKey: generated.cacheKey,
    cached: generated.cached,
    precision,
    nativeSamples,
    nativeRepetitions,
    referenceRepetitions,
    rows: rows.map((row) => ({
      ...row,
      versusAot: row.milliseconds / aot.milliseconds,
    })),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(report.workload);
  console.log(
    `AOT cache ${generated.cached ? "hit" : "miss"}: ` +
      generated.cacheKey,
  );
  console.log(
    "runtime".padEnd(22),
    "median/call".padStart(14),
    "versus AOT".padStart(12),
  );
  console.log("-".repeat(50));
  for (const row of report.rows) {
    console.log(
      row.runtime.padEnd(22),
      `${row.milliseconds.toFixed(3)} ms`.padStart(14),
      `${row.versusAot.toFixed(1)}x`.padStart(12),
    );
  }
  console.log(`result: ${cpython.value}`);
  console.log(
    "This prototype compiles an explicitly typed kernel; it does not yet " +
      "automatically AOT-compile unmodified mpmath source.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

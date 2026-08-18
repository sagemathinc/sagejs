#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const os = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const { createSage } = require("../../dist/tools/kernel.js");
const flint = require("../../packages/flint");

const repositoryRoot = resolve(__dirname, "../..");
const manifestPath = resolve(
  repositoryRoot,
  "test/data/elliptic-analytic-rank/curves.json",
);
const addonPath = require.resolve(
  "../../packages/flint/build/Release/sagejs_flint.node",
);
const samplesIndex = process.argv.indexOf("--samples");
const samples = samplesIndex === -1 ? 7 : Number(process.argv[samplesIndex + 1]);

if (!Number.isSafeInteger(samples) || samples < 1) {
  throw new Error("--samples must be a positive integer");
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function summary(values) {
  const middle = median(values);
  return {
    samples: values.length,
    medianMilliseconds: middle,
    medianAbsoluteDeviationMilliseconds: median(
      values.map((value) => Math.abs(value - middle)),
    ),
    minimumMilliseconds: Math.min(...values),
    maximumMilliseconds: Math.max(...values),
  };
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "unavailable";
}

async function numeric(session, source) {
  return Number((await session.evaluate(source, { timeout: 120_000 })).repr);
}

async function measure(session, functionName) {
  await session.evaluate(`${functionName}()`);
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    values.push(await numeric(session, `${functionName}()`));
  }
  return summary(values);
}

async function main() {
  const coldStarted = performance.now();
  const session = await createSage();
  try {
    const cold = await session.evaluate(
      "EllipticCurve([2,3,1,4,50]).analytic_rank(leading_coefficient=True, prec=64)",
      { timeout: 120_000 },
    );
    const coldProcessMilliseconds = performance.now() - coldStarted;
    if (!cold.repr.startsWith("(2,")) {
      throw new Error(`unexpected motivating-curve result: ${cold.repr}`);
    }

    await session.evaluate(
      [
        "import sagejs.runtime as analytic_benchmark_runtime",
        "import sagejs.elliptic_curves.analytic_rank as analytic_benchmark_module",
        "analytic_benchmark_ainvs = [2,3,1,4,50]",
        "analytic_benchmark_cached_curve = EllipticCurve(analytic_benchmark_ainvs)",
        "analytic_benchmark_cached_curve.analytic_rank(prec=64)",
        "analytic_benchmark_kernel_curve = EllipticCurve(analytic_benchmark_ainvs)",
        "analytic_benchmark_cutoff = analytic_benchmark_module.choose_native_cutoff(int(analytic_benchmark_kernel_curve.conductor()), 64)",
        "analytic_benchmark_coefficients = analytic_benchmark_kernel_curve.anlist(analytic_benchmark_cutoff)",
        "def analytic_benchmark_fresh():",
        "    curve = EllipticCurve(analytic_benchmark_ainvs)",
        "    started = analytic_benchmark_runtime.wall_time()",
        "    answer = curve.analytic_rank(prec=64)",
        "    elapsed = (analytic_benchmark_runtime.wall_time()-started)*1000",
        "    if answer != 2:",
        "        raise RuntimeError('wrong fresh probable rank')",
        "    return elapsed",
        "def analytic_benchmark_cached():",
        "    started = analytic_benchmark_runtime.wall_time()",
        "    answer = analytic_benchmark_cached_curve.analytic_rank(prec=64)",
        "    elapsed = (analytic_benchmark_runtime.wall_time()-started)*1000",
        "    if answer != 2:",
        "        raise RuntimeError('wrong cached probable rank')",
        "    return elapsed",
        "def analytic_benchmark_coefficients_only():",
        "    curve = EllipticCurve(analytic_benchmark_ainvs)",
        "    started = analytic_benchmark_runtime.wall_time()",
        "    values = curve.anlist(analytic_benchmark_cutoff)",
        "    elapsed = (analytic_benchmark_runtime.wall_time()-started)*1000",
        "    if len(values) != analytic_benchmark_cutoff+1:",
        "        raise RuntimeError('wrong coefficient prefix')",
        "    return elapsed",
        "def analytic_benchmark_kernel_only():",
        "    started = analytic_benchmark_runtime.wall_time()",
        "    jet = analytic_benchmark_kernel_curve._analytic_completed_derivatives_native(analytic_benchmark_coefficients, 0, 7, 64)",
        "    elapsed = (analytic_benchmark_runtime.wall_time()-started)*1000",
        "    if jet['status'] != 'ok':",
        "        raise RuntimeError('native kernel failed')",
        "    return elapsed",
      ].join("\n"),
      { timeout: 120_000 },
    );

    const report = {
      schema: "sagejs.benchmark/elliptic-analytic-rank-v1",
      commit: gitCommit(),
      platform: {
        os: `${os.type()} ${os.release()}`,
        architecture: os.arch(),
        cpu: os.cpus()[0]?.model || "unknown",
        logicalCpus: os.cpus().length,
        node: process.version,
      },
      native: {
        resolvedModule: addonPath,
        moduleSha256: digest(addonPath),
        flint: flint.version(),
        gmp: flint.gmpVersion(),
        smalljac: flint.smalljacVersion(),
      },
      corpus: {
        manifest: "test/data/elliptic-analytic-rank/curves.json",
        sha256: digest(manifestPath),
      },
      workload: {
        curve: "[2,3,1,4,50]",
        conductor: 1_008_811,
        expectedProbableRank: 2,
        precisionBits: 64,
        refinementPrecisionBits: 88,
        coefficientCutoff: await numeric(session, "analytic_benchmark_cutoff"),
        warmupSamples: 1,
      },
      timings: {
        coldProcessStartupCurveAndPublicCall: {
          samples: 1,
          milliseconds: coldProcessMilliseconds,
        },
        exactCoefficientGeneration: await measure(
          session,
          "analytic_benchmark_coefficients_only",
        ),
        nativeKernelWithResidentCoefficients: await measure(
          session,
          "analytic_benchmark_kernel_only",
        ),
        warmFreshCurvePublicCall: await measure(
          session,
          "analytic_benchmark_fresh",
        ),
        cachedSameObjectPublicCall: await measure(
          session,
          "analytic_benchmark_cached",
        ),
      },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

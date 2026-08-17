#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const { createSage } = require("../dist/tools/kernel.js");

const repetitions = 11;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
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

function timingProgram() {
  return [
    "import conway_polynomials, time",
    "from sage.databases.conway import ConwayPolynomials",
    "construction_samples = []",
    `for _ in range(${repetitions}):`,
    "    conway_polynomials._conway_dict = None",
    "    started = time.perf_counter()",
    "    c = ConwayPolynomials()",
    "    construction_samples.append((time.perf_counter() - started) * 1000)",
    "values_samples = []",
    `for _ in range(${repetitions}):`,
    "    started = time.perf_counter()",
    "    values = list(c.values())",
    "    values_samples.append((time.perf_counter() - started) * 1000)",
    "result = (construction_samples, values_samples, len(c), len(c.primes()), c[60869, 3], len(values), values[0], values[-1])",
  ].join("\n");
}

async function measureSageJS() {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(`${timingProgram()}\nresult`);
    const parsed = JSON.parse(result.repr.replaceAll("(", "[").replaceAll(")", "]"));
    assert.deepEqual(parsed.slice(2), [
      47_090,
      10_453,
      [60_867, 2, 0, 1],
      47_090,
      [1, 1],
      [3, 100_525, 3, 0, 1],
    ]);
    return { construction: summary(parsed[0]), values: summary(parsed[1]) };
  } finally {
    await session.close();
  }
}

function measureSage(executable) {
  const program = `${timingProgram()}\nimport json\nprint(json.dumps(result))`;
  const result = spawnSync(executable, ["-c", program], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${executable} exited with ${result.status}`);
  }
  const parsed = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.deepEqual(parsed.slice(2), [
    47_090,
    10_453,
    [60_867, 2, 0, 1],
    47_090,
    [1, 1],
    [3, 100_525, 3, 0, 1],
  ]);
  return { construction: summary(parsed[0]), values: summary(parsed[1]) };
}

function sageVersion(executable) {
  const result = spawnSync(
    executable,
    ["-c", "from sage.env import SAGE_VERSION; print(SAGE_VERSION)"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `${executable} exited with ${result.status}`);
  }
  return result.stdout.trim();
}

async function main() {
  const sageIndex = process.argv.indexOf("--sage");
  const sageExecutable = sageIndex === -1 ? undefined : process.argv[sageIndex + 1];
  const sagejs = await measureSageJS();
  const sage = sageExecutable ? measureSage(sageExecutable) : undefined;
  const report = {
    workload:
      "construct the complete 47,090-record database and materialize all values",
    exactResult: [
      47_090,
      10_453,
      [60_867, 2, 0, 1],
      47_090,
      [1, 1],
      [3, 100_525, 3, 0, 1],
    ],
    warmupPolicy: "imports excluded; filesystem cache uncontrolled; 11 consecutive samples",
    host: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown",
    },
    sagejs,
    sage,
    sageExecutable,
    sageVersion: sageExecutable ? sageVersion(sageExecutable) : undefined,
    sagejsToSageMedianRatio: sage
      ? {
          construction:
            sagejs.construction.medianMilliseconds /
            sage.construction.medianMilliseconds,
          values: sagejs.values.medianMilliseconds / sage.values.medianMilliseconds,
        }
      : undefined,
  };
  if (process.argv.includes("--check")) {
    assert.ok(sage, "--check requires --sage <executable>");
    for (const workload of ["construction", "values"]) {
      assert.ok(
        sagejs[workload].medianMilliseconds <= sage[workload].medianMilliseconds,
        `Sage.js ${workload} ${sagejs[workload].medianMilliseconds.toFixed(1)} ms exceeds Sage ${sage[workload].medianMilliseconds.toFixed(1)} ms`,
      );
    }
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const samples = Number(process.env.SAGEJS_ROUND_SAMPLES ?? "7");
const warmups = Number(process.env.SAGEJS_ROUND_WARMUPS ?? "2");
const repetitions = Number(process.env.SAGEJS_ROUND_REPETITIONS ?? "100");
const requireBudget = process.argv.includes("--check");
const maximumWarmRatio = 20;

function benchmarkSource() {
  return String.raw`
import json
import time

samples = ${samples}
warmups = ${warmups}
repetitions = ${repetitions}
values = [(index - 500.5) / 137.0 for index in range(1, 1001)]
cases = [('loop-control', None), ('ndigits-0', 0), ('ndigits-2', 2), ('ndigits-6', 6)]

def measure(digits):
    checksum = 0.0
    started = time.perf_counter_ns()
    for _repeat in range(repetitions):
        if digits is None:
            for value in values:
                checksum += value
        else:
            for value in values:
                checksum += round(value, digits)
    elapsed = time.perf_counter_ns() - started
    return elapsed / 1_000_000, repr(checksum)

result = {}
for name, digits in cases:
    for _warmup in range(warmups):
        measure(digits)
    timings = []
    checksum = None
    for _sample in range(samples):
        elapsed, observed = measure(digits)
        timings.append(elapsed)
        if checksum is None:
            checksum = observed
        else:
            assert checksum == observed
    timings.sort()
    result[name] = {
        'warm_median_ms': timings[len(timings) // 2],
        'checksum': checksum,
        'calls': repetitions * len(values),
        'samples_ms': timings,
    }

print('SAGEJS_ROUND_BENCH ' + json.dumps(result, sort_keys=True))
`;
}

function parseResult(stdout) {
  const line = stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith("SAGEJS_ROUND_BENCH "));
  if (!line) throw new Error(`round benchmark emitted no result:\n${stdout}`);
  return JSON.parse(line.slice("SAGEJS_ROUND_BENCH ".length));
}

function runCPython(source) {
  const result = spawnSync(pythonExecutable(), ["-c", source], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "CPython benchmark failed");
  }
  return parseResult(result.stdout);
}

async function runSageJS(source) {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(source, { timeoutMs: 120_000 });
    return parseResult(result.stdout);
  } finally {
    await session.close();
  }
}

function formatRows(sagejs, cpython) {
  return Object.keys(cpython).map((name) => {
    const left = sagejs[name];
    const right = cpython[name];
    assert.ok(left, `Sage.js omitted ${name}`);
    assert.equal(left.checksum, right.checksum, `${name} checksum differs`);
    const ratio = left.warm_median_ms / right.warm_median_ms;
    return {
      workload: name,
      calls: left.calls,
      sagejs_ms: Number(left.warm_median_ms.toFixed(3)),
      cpython_ms: Number(right.warm_median_ms.toFixed(3)),
      sagejs_over_cpython: Number(ratio.toFixed(3)),
      sagejs_ns_per_iteration: Number(
        ((left.warm_median_ms * 1e6) / left.calls).toFixed(1),
      ),
    };
  });
}

(async () => {
  assert.ok(Number.isInteger(samples) && samples >= 3 && samples % 2 === 1);
  assert.ok(Number.isInteger(warmups) && warmups >= 1);
  assert.ok(Number.isInteger(repetitions) && repetitions >= 1);
  const source = benchmarkSource();
  const cpython = runCPython(source);
  const sagejs = await runSageJS(source);
  const rows = formatRows(sagejs, cpython);
  console.log(
    `Warm in-process medians; ${samples} samples after ${warmups} warmups`,
  );
  console.table(rows);
  if (requireBudget) {
    for (const row of rows) {
      if (row.workload === "loop-control") continue;
      assert.ok(
        row.sagejs_over_cpython <= maximumWarmRatio,
        `${row.workload} is ${row.sagejs_over_cpython}x CPython; reviewed ceiling is ${maximumWarmRatio}x`,
      );
    }
    console.log(`PASS: every round workload is at most ${maximumWarmRatio}x CPython`);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

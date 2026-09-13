#!/usr/bin/env node
"use strict";

const path = require("node:path");

const MARKER = "__SAGEJS_NUMERICAL_SOAK_SESSION__";

function value(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) throw new Error(`${name} is required`);
  return argv[index + 1];
}

function integer(argv, name, minimum) {
  const result = Number(value(argv, name));
  if (!Number.isSafeInteger(result) || result < minimum) {
    throw new Error(`${name} must be an integer at least ${minimum}`);
  }
  return result;
}

function parseArguments(argv) {
  const accepted = new Set([
    "--artifact", "--cycles-per-block", "--minimum-operations",
    "--minimum-elapsed-ms", "--maximum-blocks", "--memory-slope-window-samples",
    "--maximum-heap-slope-bytes-per-operation",
    "--maximum-rss-slope-bytes-per-operation",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    if (!accepted.has(argv[index]) || argv[index + 1] === undefined) {
      throw new Error(`invalid argument ${argv[index] ?? "<missing>"}`);
    }
  }
  return {
    artifact: path.resolve(value(argv, "--artifact")),
    cyclesPerBlock: integer(argv, "--cycles-per-block", 1),
    minimumOperations: integer(argv, "--minimum-operations", 1),
    minimumElapsedMs: integer(argv, "--minimum-elapsed-ms", 0),
    maximumBlocks: integer(argv, "--maximum-blocks", 1),
    memorySlopeWindowSamples: integer(argv, "--memory-slope-window-samples", 2),
    maximumHeapSlopeBytesPerOperation:
      integer(argv, "--maximum-heap-slope-bytes-per-operation", 0),
    maximumRssSlopeBytesPerOperation:
      integer(argv, "--maximum-rss-slope-bytes-per-operation", 0),
  };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function slope(samples, field) {
  const values = [];
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const work = samples[right].operations - samples[left].operations;
      if (work !== 0) values.push((samples[right][field] - samples[left][field]) / work);
    }
  }
  return values.length === 0 ? Number.POSITIVE_INFINITY : median(values);
}

function memoryIsStable(samples, options) {
  if (samples.length < options.memorySlopeWindowSamples) return false;
  const window = samples.slice(-options.memorySlopeWindowSamples);
  return slope(window, "heap_used_bytes") <= options.maximumHeapSlopeBytesPerOperation &&
    slope(window, "rss_bytes") <= options.maximumRssSlopeBytesPerOperation;
}

function parseEvaluation(result) {
  const line = String(result?.stdout ?? "")
    .split(/\r?\n/)
    .findLast((candidate) => candidate.startsWith(MARKER));
  if (line === undefined) {
    throw new Error(`Sage.js soak evaluation returned no record: ${result?.stderr ?? ""}`);
  }
  return JSON.parse(line.slice(MARKER.length));
}

function memorySample(block, operations) {
  if (typeof global.gc === "function") {
    global.gc();
    global.gc();
  }
  const memory = process.memoryUsage();
  return {
    block,
    operations,
    rss_bytes: memory.rss,
    heap_used_bytes: memory.heapUsed,
    external_bytes: memory.external,
    array_buffers_bytes: memory.arrayBuffers,
  };
}

function blockSource(cycles) {
  return String.raw`
import json
import math
from sagejs.numerics import find_root
from sagejs.numerics.integration import integrate
from sagejs.numerics.linear_algebra import solve
from sagejs.numerics.ode import solve_ivp
from sagejs.numerics.optimization import minimize_scalar
from sagejs.numerics.spectral import fft
from sagejs.numerics.statistics import describe

maximum_error = 0.0
failures = 0
operations = 0
for trial in range(${cycles}):
    root = find_root(lambda x: math.cos(x)-x, 0.0, 1.0, method="brent")
    integral = integrate(math.sin, 0.0, math.pi)
    linear = solve([[3.0, 1.0], [1.0, 2.0]], [9.0, 8.0])
    minimum = minimize_scalar(lambda x: (x-2.0)**2, -1.0, 5.0)
    ode = solve_ivp(
        lambda t, y: [y[0]], (0.0, 0.25), [1.0],
        reference=lambda t: [math.exp(t)],
        reference_atol=1.0e-6, reference_rtol=1.0e-6,
    )
    transform = fft([1.0, 2.0, -1.0, 0.5, 3.0])
    summary = describe([1.0, 2.0, 3.0, 4.0])
    successes = (
        root.success, integral.success, linear.success, minimum.success,
        ode.success, transform.success, summary.success,
    )
    failures += sum(1 for value in successes if value is not True)
    maximum_error = max(
        maximum_error,
        abs(math.cos(root.value)-root.value),
        abs(integral.value-2.0),
        abs(linear.value[0]-2.0), abs(linear.value[1]-3.0),
        abs(minimum.value-2.0),
        abs(ode.value[0]-math.exp(0.25)),
        abs(transform.value[0]-5.5),
        abs(summary.value["mean"]-2.5),
    )
    operations += 7
print(${JSON.stringify(MARKER)} + json.dumps({
    "operations": operations,
    "failures": failures,
    "maximum_error": maximum_error,
}, sort_keys=True, separators=(",", ":")))
`;
}

function recoverySource() {
  return String.raw`
import json
from sagejs.numerics import find_root

budgeted = find_root(
    lambda x: x*x-2.0, 0.0, 2.0, method="brent", max_evaluations=1,
)
cancelled = find_root(
    lambda x: x*x-2.0, 0.0, 2.0, method="brent", cancel=lambda: True,
)
callback = find_root(lambda x: 1.0/0.0, 0.0, 1.0, method="brent")
recovered = find_root(lambda x: x*x-2.0, 0.0, 2.0, method="brent")
print(${JSON.stringify(MARKER)} + json.dumps({
    "budget_status": budgeted.status,
    "budget_evaluations": budgeted.evaluations,
    "cancelled_status": cancelled.status,
    "cancelled_evaluations": cancelled.evaluations,
    "callback_status": callback.status,
    "callback_evaluations": callback.evaluations,
    "recovered": recovered.success,
    "recovery_residual": abs(recovered.value*recovered.value-2.0),
}, sort_keys=True, separators=(",", ":")))
`;
}

async function run(options) {
  const started = process.hrtime.bigint();
  const { createSage } = require(path.join(options.artifact, "tools", "kernel.js"));
  const session = await createSage({ mode: "python" });
  const samples = [memorySample(0, 0)];
  let blocks = 0;
  let operations = 0;
  let failures = 0;
  let maximumError = 0;
  let recovery;
  try {
    recovery = parseEvaluation(await session.evaluate(recoverySource()));
    while (blocks < options.maximumBlocks) {
      const record = parseEvaluation(await session.evaluate(blockSource(options.cyclesPerBlock)));
      blocks += 1;
      operations += record.operations;
      failures += record.failures;
      maximumError = Math.max(maximumError, record.maximum_error);
      samples.push(memorySample(blocks, operations));
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      if (operations >= options.minimumOperations && elapsed >= options.minimumElapsedMs &&
          memoryIsStable(samples, options)) break;
    }
  } finally {
    await session.close();
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    status: "passed",
    elapsed_ms: elapsedMs,
    blocks,
    cycles: blocks * options.cyclesPerBlock,
    operations,
    failures,
    maximum_error: maximumError,
    recovery,
    memory_samples: samples,
  };
}

async function main(argv = process.argv.slice(2)) {
  const record = await run(parseArguments(argv));
  process.stdout.write(`${MARKER}${JSON.stringify(record)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  MARKER,
  blockSource,
  memoryIsStable,
  parseArguments,
  parseEvaluation,
  recoverySource,
  run,
  slope,
};

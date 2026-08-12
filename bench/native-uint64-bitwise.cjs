"use strict";

const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { arch, cpus, platform, release } = require("node:os");
const { join } = require("node:path");

const {
  compileKernel,
} = require("../tools/native-kernel/compiler.cjs");

const source = `# sagejs: native-bitwise
from sagejs.native import native, uint64


@native
def xorshift64(seed: uint64, rounds: uint64) -> uint64:
    value: uint64 = seed
    for _ in range(rounds):
        value ^= value << 13
        value ^= value >> 7
        value ^= value << 17
    return value
`;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const WARMUPS = 2;
const SAMPLES = 7;

function measure(fn, args, warmups, samples) {
  for (let warmup = 0; warmup < warmups; warmup += 1) fn(...args);
  const values = [];
  let result;
  for (let sample = 0; sample < samples; sample += 1) {
    const start = process.hrtime.bigint();
    result = fn(...args);
    values.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return { medianMs: median(values), result: String(result) };
}

function measureDynamic(directory, args) {
  const runnerPath = join(directory, "run_dynamic.py");
  writeFileSync(runnerPath, `
import json
import sys
import time

sys.path.insert(0, ${JSON.stringify(directory)})
from uint64_bitwise_bench import xorshift64

args = (${args[0]}, ${args[1]})
for _ in range(${WARMUPS}):
    xorshift64(*args)
samples = []
result = None
for _ in range(${SAMPLES}):
    started = time.perf_counter()
    result = xorshift64(*args)
    samples.append((time.perf_counter() - started) * 1000)
samples.sort()
print(json.dumps({
    "medianMs": samples[len(samples) // 2],
    "result": str(result),
}))
`);
  const measured = spawnSync(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs"), runnerPath],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_NATIVE_MODE: "dynamic",
        SAGEJS_NATIVE_AUTOLOAD: "0",
      },
    },
  );
  if (measured.error) throw measured.error;
  if (measured.status !== 0) {
    throw new Error(measured.stdout + measured.stderr);
  }
  const line = measured.stdout.trim().split("\n").at(-1);
  return JSON.parse(line);
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-uint64-bitwise-bench-"));
  try {
    const sourcePath = join(directory, "uint64_bitwise_bench.py");
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(directory, "cache"),
    });
    const kernel = require(compiled.modulePath).xorshift64;
    const args = [0x6a09e667f3bcc909n, 1_000_000n];
    const native = measure(kernel, args, WARMUPS, SAMPLES);
    const javascript = measure(kernel.javascript, args, WARMUPS, SAMPLES);
    const dynamic = measureDynamic(directory, args);
    if (native.result !== javascript.result || native.result !== dynamic.result) {
      throw new Error(
        "native, portable JavaScript, and dynamic xorshift64 results differ",
      );
    }
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.native-uint64-bitwise-benchmark/v1",
      host: {
        node: process.version,
        v8: process.versions.v8,
        platform: platform(),
        release: release(),
        arch: arch(),
        cpu: cpus()[0]?.model || "unknown",
      },
      policy: {
        warmups: WARMUPS,
        samples: SAMPLES,
        statistic: "median wall-clock milliseconds",
        compilationAndConstructionExcluded: true,
        resultEquivalenceChecked: true,
        dynamicMode: "same-source Sage.js with SAGEJS_NATIVE_MODE=dynamic",
      },
      rounds: Number(args[1]),
      native,
      javascript,
      dynamic,
      speedup: {
        javascriptOverNative: javascript.medianMs / native.medianMs,
        dynamicOverNative: dynamic.medianMs / native.medianMs,
      },
    }, null, 2)}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

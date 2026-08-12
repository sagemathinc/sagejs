"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
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

function measure(fn, args, samples) {
  const values = [];
  let result;
  for (let sample = 0; sample < samples; sample += 1) {
    const start = process.hrtime.bigint();
    result = fn(...args);
    values.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return { medianMs: median(values), result: String(result) };
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
    kernel(...args);
    kernel.javascript(...args);
    const native = measure(kernel, args, 7);
    const javascript = measure(kernel.javascript, args, 7);
    if (native.result !== javascript.result) {
      throw new Error("native and JavaScript xorshift64 results differ");
    }
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.native-uint64-bitwise-benchmark/v1",
      rounds: Number(args[1]),
      native,
      javascript,
      speedup: javascript.medianMs / native.medianMs,
    }, null, 2)}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

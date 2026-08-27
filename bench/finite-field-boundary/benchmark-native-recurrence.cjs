#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  compileKernel,
} = require("../../tools/native-kernel/compiler.cjs");

const count = 10_000_000;
const modulus = 65_521;
const multiplier = 12_345;
const increment = 6_789;
const expected = 19_598n;
const samples = 9;

const source = `from sagejs.native import native, uint64


@native
def modular_multiply_add_recurrence(
    count: uint64,
    modulus: uint64,
    multiplier: uint64,
    increment: uint64,
) -> uint64:
    value: uint64 = 1
    for _index in range(count):
        value = (value * multiplier + increment) % modulus
    return value
`;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-recurrence-"));
  try {
    const sourcePath = join(directory, "native_recurrence.py");
    const cacheRoot = join(directory, "cache");
    writeFileSync(sourcePath, source);

    const compileStart = performance.now();
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    const compileMs = performance.now() - compileStart;

    const loadStart = performance.now();
    const kernel = require(compiled.modulePath);
    const loadMs = performance.now() - loadStart;
    const fn = kernel.modular_multiply_add_recurrence;

    const variants = {
      default_native_dispatch: fn,
      tagged_native_abi: fn.tagged,
      portable_javascript_ir: fn.javascript,
    };
    const measurements = {};
    for (const [name, variant] of Object.entries(variants)) {
      const coldStart = performance.now();
      const coldResult = variant(count, modulus, multiplier, increment);
      const coldMs = performance.now() - coldStart;
      if (coldResult !== expected) {
        throw new Error(`${name} cold checksum ${coldResult} != ${expected}`);
      }

      const warmMs = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const start = performance.now();
        const result = variant(count, modulus, multiplier, increment);
        warmMs.push(performance.now() - start);
        if (result !== expected) {
          throw new Error(`${name} warm checksum ${result} != ${expected}`);
        }
      }
      measurements[name] = {
        cold_call_ms: coldMs,
        warm_ms: warmMs,
        warm_median_ms: median(warmMs),
        warm_median_ns_per_step: (median(warmMs) * 1e6) / count,
      };
    }

    const result = {
      schema: "sagejs.finite-field-native-recurrence/v1",
      runtime: `node-${process.versions.node}`,
      platform: `${process.platform}-${process.arch}`,
      count,
      modulus,
      multiplier,
      increment,
      checksum: expected.toString(),
      compile_ms: compileMs,
      load_ms: loadMs,
      measurements,
      native_available: fn.nativeAvailable,
      selected_backend: fn.backendFor(
        count,
        modulus,
        multiplier,
        increment,
      ),
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (process.argv.includes("--check")) {
      if (!result.native_available) {
        throw new Error("the @native kernel has no machine-code backend");
      }
      if (["javascript-number", "bigint"].includes(result.selected_backend)) {
        throw new Error(
          `expected a compiled backend, got ${result.selected_backend}`,
        );
      }
      const nativeNs =
        result.measurements.default_native_dispatch.warm_median_ns_per_step;
      if (nativeNs > 20) {
        throw new Error(
          `native recurrence exceeded 20 ns/step: ${nativeNs}`,
        );
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

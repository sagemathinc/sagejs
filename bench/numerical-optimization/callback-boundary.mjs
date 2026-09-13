#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import process from "node:process";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.SAGEJS_ROOT
  ? resolve(process.env.SAGEJS_ROOT)
  : resolve(here, "../..");
const { inspectToolchain, resolveToolchain } = require(
  join(root, "packages/wasm-toolchain/scripts/toolchain.cjs"),
);

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function timedSamples(callback, samples) {
  const durations = [];
  let checksum = 0;
  callback();
  for (let sample = 0; sample < samples; sample += 1) {
    const started = process.hrtime.bigint();
    checksum += callback();
    durations.push(Number(process.hrtime.bigint() - started));
  }
  return { durations, checksum };
}

function compileProbe(output) {
  const inspection = inspectToolchain({ root });
  if (!inspection.ready) {
    throw new Error(
      "The Sage.js Wasm toolchain is not ready. Run " +
        "`pnpm --dir packages/wasm-toolchain toolchain:prepare` first.",
    );
  }
  const toolchain = resolveToolchain({ root });
  const result = spawnSync(
    toolchain.paths.clang,
    [
      "--target=wasm32-wasip1",
      "-nostdlib",
      "-O3",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-fno-builtin",
      "-Wl,--no-entry",
      "-Wl,--allow-undefined",
      "-Wl,--export=run_host_callbacks",
      "-Wl,--export=run_local_calls",
      "-Wl,--export-memory",
      join(here, "callback-probe.c"),
      "-o",
      output,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Wasm callback probe compiler exited with ${result.status}:\n${result.stderr}`,
    );
  }
  return toolchain;
}

function parseArguments(argv) {
  const options = { count: 1_000_000, samples: 9, output: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!["--count", "--samples", "--output"].includes(option)) {
      throw new Error(`unknown option ${option}`);
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`missing value after ${option}`);
    index += 1;
    if (option === "--count") options.count = Number.parseInt(value, 10);
    if (option === "--samples") options.samples = Number.parseInt(value, 10);
    if (option === "--output") options.output = resolve(value);
  }
  if (options.count <= 0 || options.samples <= 0) {
    throw new Error("--count and --samples must be positive integers");
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const directory = mkdtempSync(join(tmpdir(), "sagejs-numerical-callback-"));
try {
  const wasmPath = join(directory, "callback-probe.wasm");
  const toolchain = compileProbe(wasmPath);
  const objective = (value) => value * value + 0.5 * value + 1.0;
  const module = await WebAssembly.instantiate(readFileSync(wasmPath), {
    env: { objective },
  });
  const { run_host_callbacks: runHostCallbacks, run_local_calls: runLocalCalls } =
    module.instance.exports;
  const count = options.count;
  const initial = 0.125;
  const direct = timedSamples(() => {
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      total += objective(initial + index * 1.0e-9);
    }
    return total;
  }, options.samples);
  const local = timedSamples(
    () => runLocalCalls(count, initial),
    options.samples,
  );
  const callback = timedSamples(
    () => runHostCallbacks(count, initial),
    options.samples,
  );
  const describe = (measurement) => ({
    durations_ms: measurement.durations.map((duration) => duration / 1e6),
    median_ms: median(measurement.durations) / 1e6,
    median_ns_per_call: median(measurement.durations) / count,
    checksum: measurement.checksum,
  });
  const receipt = {
    schema: "sagejs.numerical-callback-boundary/v1",
    count,
    samples: options.samples,
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      clang: toolchain.paths.clang,
    },
    direct_javascript: describe(direct),
    wasm_local_call: describe(local),
    wasm_to_javascript_callback: describe(callback),
  };
  const encoded = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.output) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(options.output, encoded);
  }
  process.stdout.write(encoded);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

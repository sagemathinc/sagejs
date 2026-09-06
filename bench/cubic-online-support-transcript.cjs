"use strict";

// Local prepared-kernel A/B diagnostic, not a controlled PARI comparison.
// node bench/cubic-online-support-transcript.cjs OLD_ROOT NEW_ROOT
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const logicalSource = "sagejs/number_fields/cubic_class_number_native.py";
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function measure(root) {
  const published = join(root, "dist/native-kernels");
  const index = JSON.parse(readFileSync(join(published, "index.json")));
  const record = index.logicalSources[logicalSource];
  const sourceHash = createHash("sha256")
    .update(readFileSync(join(root, "src/lib", logicalSource))).digest("hex");
  assert.equal(record.sourceHash, sourceHash);
  const wrapper = require(join(published, record.cacheKey, "index.cjs"));
  assert.equal(wrapper.sourceHash, sourceHash);
  const kernel = wrapper.certified_complex_cubic_class_group_v1;
  assert.equal(kernel.backendPolicy.kind, "fmpz");
  const zeros = (length, words = 64) => kernel.createIntegerBuffer(length, words);
  const output = zeros(64, 256);
  const coefficients = kernel.packIntegerBuffer([-22763, -146, -1, 1], 64);
  const modular = kernel.createUInt64Buffer(64 * 64 + 64 + 1);
  const buffers = [512, 4, 9, 16, 16, 144, 48, 109, 1, 1, 1].map((n) => zeros(n));
  const run = () => kernel.fmpz(
    output, coefficients, modular, ...buffers, 0, 5, 1_048_576, 3_145_728,
  );
  for (let i = 0; i < 5; i++) assert.equal(run(), true);
  const samplesMs = [];
  for (let sample = 0; sample < 11; sample++) {
    const start = performance.now();
    for (let iteration = 0; iteration < 5; iteration++) assert.equal(run(), true);
    samplesMs.push((performance.now() - start) / 5);
  }
  const values = output.toArray();
  assert.equal(values[0], 2n);
  assert.equal(values[1], 15n);
  assert.equal(values[2], 1n);
  assert.equal(values[3], 15n);
  assert.equal(values[63], 0n);
  return { root, sourceHash, cacheKey: record.cacheKey, samplesMs, medianMs: median(samplesMs) };
}

if (process.argv[2] === "--child") {
  process.stdout.write(JSON.stringify(measure(resolve(process.argv[3]))));
} else {
  assert.equal(process.argv.length, 4, "usage: node bench/cubic-online-support-transcript.cjs OLD_ROOT NEW_ROOT");
  const roots = process.argv.slice(2).map((root) => resolve(root));
  const blocks = [];
  // Separate processes preserve each pack's allocator domain. ABBA ordering
  // reduces simple drift; this shared machine is still not a release benchmark.
  for (const variant of [0, 1, 1, 0]) {
    const result = spawnSync(process.execPath, [__filename, "--child", roots[variant]], {
      encoding: "utf8", timeout: 120_000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    blocks.push({ variant, ...JSON.parse(result.stdout) });
  }
  const medians = [0, 1].map((variant) => median(
    blocks.filter((block) => block.variant === variant).flatMap((block) => block.samplesMs),
  ));
  console.log(JSON.stringify({
    schema: "sagejs-cubic-online-support-local-ab-v1",
    host: { platform: process.platform, arch: process.arch, node: process.version,
      cpu: os.cpus()[0].model, cpuCount: os.cpus().length },
    workload: { label: "3.1.83062751.1", coefficients: [-22763, -146, -1, 1],
      effort: 5, classNumber: 15, invariants: [15], mode: "prepared direct fmpz",
      warmupsPerBlock: 5, samplesPerBlock: 11, iterationsPerSample: 5 },
    blocks, oldMedianMs: medians[0], newMedianMs: medians[1], speedup: medians[0] / medians[1],
    limitation: "Shared local host; excludes allocation of public buffers, dispatch, retries and independent replay; no PARI timing or corpus claim.",
  }, null, 2));
}

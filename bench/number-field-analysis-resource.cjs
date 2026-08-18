#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { cpus, loadavg, release, tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform === "win32") {
  throw new Error("the cross-platform lifecycle test covers Windows; this timing witness is Unix-only");
}

const root = resolve(__dirname, "..");
const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX ||
  join(root, "packages", "flint", ".native", "prefix"));
const ids = [
  "motivating-degree-7",
  "sage-essential-discriminant",
  "lmfdb-3.1.431.1",
  "lmfdb-5.1.17161.1",
  "pari-2510",
  "pari-1710",
];
const rounds = [5000, 5000, 5000, 2000, 100, 20];
const samples = Number(process.env.SAGEJS_NF_ANALYSIS_SAMPLES || 7);
const warmups = Number(process.env.SAGEJS_NF_ANALYSIS_WARMUPS || 4);
assert(Number.isSafeInteger(samples) && samples >= 3);
assert(Number.isSafeInteger(warmups) && warmups >= 0);

function run(command, args, timeout = 300_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1" },
  });
  assert.equal(result.status, 0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function compile(source, output) {
  const libraries = ["flint", "openblas", "mpc", "mpfr", "gmp"]
    .map((name) => join(prefix, "lib", `lib${name}.a`));
  run(process.env.CC || "cc", [
    "-std=c11", "-O3", "-Wall", "-Wextra", "-Werror",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    join(root, "bench", source),
    ...libraries, "-lm", "-lpthread", "-o", output,
  ], 120_000);
}

function median(values) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

function integer(buffer, cursor) {
  const header = buffer.readUInt32LE(cursor.offset);
  cursor.offset += 4;
  const length = header & 0x7fffffff;
  let value = 0n;
  for (let index = 0; index < length; index++) {
    value |= BigInt(buffer[cursor.offset + index]) << BigInt(8 * index);
  }
  cursor.offset += length;
  return (header & 0x80000000) === 0 ? value : -value;
}

function evidence(report, fused) {
  const buffer = Buffer.from(report.payloadHex, "hex");
  const cursor = { offset: fused ? 80 : 64 };
  const values = Array.from({ length: fused ? 5 : 4 }, () => integer(buffer, cursor));
  const selected = fused
    ? [values[1], values[2], values[3], values[4]]
    : [values[0], values[1], values[2], values[3]];
  return {
    denominator: selected[0].toString(),
    index: selected[1].toString(),
    equationDiscriminant: selected[2].toString(),
    orderDiscriminant: selected[3].toString(),
  };
}

function measure(executable, caseIndex, fused) {
  const timings = [];
  let final;
  for (let sample = 0; sample < samples; sample++) {
    final = JSON.parse(run(executable, [String(caseIndex), String(warmups), String(rounds[caseIndex])]));
    timings.push(final.meanUs);
  }
  return {
    medianUs: median(timings),
    samplesUs: timings,
    payloadBytes: Buffer.from(final.payloadHex, "hex").length,
    evidence: evidence(final, fused),
  };
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-analysis-bench-"));
try {
  const fusedExecutable = join(temporary, "fused");
  const directExecutable = join(temporary, "direct");
  compile("number-field-analysis-resource-witness.c", fusedExecutable);
  compile("number-field-order-resource-witness.c", directExecutable);
  const cases = ids.map((id, index) => {
    const fused = measure(fusedExecutable, index, true);
    const direct = measure(directExecutable, index, false);
    assert.deepEqual(fused.evidence, direct.evidence,
      `${id}: fused partial order differs from the certified direct resource`);
    return {
      id,
      roundsPerSample: rounds[index],
      fused,
      directWithPrimeHints: direct,
      fusedToDirectRatio: fused.medianUs / direct.medianUs,
    };
  });
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.number-field-analysis-resource-benchmark/v1",
    commit: run("git", ["rev-parse", "HEAD"]),
    environment: {
      platform: `${process.platform}-${process.arch}`,
      osRelease: release(),
      cpu: cpus()[0]?.model || "unknown",
      loadAverageAtReport: loadavg(),
      node: process.version,
      compiler: run(process.env.CC || "cc", ["--version"]).split("\n")[0],
      flint: "3.6.0",
      openblasThreads: 1,
    },
    policy: {
      samples,
      warmups,
      trialBound: 1000,
      timedBoundary: "already sealed integral polynomial to allocated immutable resource",
      caveat: "The fused path discovers bounded components; the direct oracle receives exact local index-prime hints. Generated host transfer and independent Python authentication are outside both kernel timings.",
    },
    cases,
  }, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { readFileSync, realpathSync } = require("node:fs");
const { hostname, platform, release, arch, cpus } = require("node:os");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const repository = resolve(__dirname, "../..");
const casesPath = join(__dirname, "cases-v1.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveExecutable(command) {
  if (command.includes("/") || command.includes("\\")) return resolve(command);
  const lookup = spawnSync("which", [command], { encoding: "utf8" });
  if (lookup.status !== 0) throw new Error(`cannot resolve ${command}`);
  return lookup.stdout.trim();
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function run(name, command, args, harness, repeat, environment = {}, backendExecutable = command) {
  const started = performance.now();
  const result = spawnSync(command, [...args, "--repeat", String(repeat)], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, ...environment },
  });
  const processWall = performance.now() - started;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${name} exited with status ${result.status}`);
  }
  const jsonStart = result.stdout.indexOf("{");
  const output = JSON.parse(result.stdout.slice(jsonStart));
  if (output.timings_ms.length !== repeat) throw new Error(`${name} omitted timing samples`);
  const executable = realpathSync(backendExecutable);
  return {
    backend: name,
    backend_version: output.oracle.version,
    process_wall_ms: processWall,
    first_algorithm_ms: output.timings_ms[0],
    warm_algorithm_samples_ms: output.timings_ms.slice(1),
    warm_algorithm_median_ms: repeat === 1 ? null : median(output.timings_ms.slice(1)),
    result_sha256: sha256(JSON.stringify(output.rows)),
    executable_sha256: sha256(readFileSync(executable)),
    harness_sha256: sha256(readFileSync(harness)),
  };
}

function main() {
  const repeatIndex = process.argv.indexOf("--repeat");
  const repeat = repeatIndex < 0 ? 3 : Number(process.argv[repeatIndex + 1]);
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer");
  const sage = resolveExecutable(process.env.SAGE ?? "/home/user/sagelite/sage");
  const magma = resolveExecutable(process.env.MAGMA ?? "/home/user/bin/magma");
  const python = resolveExecutable(process.env.PYTHON ?? "python3");
  const exhaustiveHarness = join(__dirname, "exhaustive_oracle.py");
  const sageHarness = join(__dirname, "sage_oracle.py");
  const pariHarness = join(__dirname, "pari_oracle.py");
  const magmaHarness = join(__dirname, "magma_oracle.cjs");
  const results = [
    run("exhaustive-python", python, [exhaustiveHarness, casesPath], exhaustiveHarness, repeat),
    run("sage", sage, [sageHarness, casesPath, "--benchmark-core"], sageHarness, repeat),
    run("pari-hyperellcharpoly", sage, [pariHarness, casesPath], pariHarness, repeat),
    run(
      "magma",
      process.execPath,
      [magmaHarness, casesPath, "--benchmark-core"],
      magmaHarness,
      repeat,
      { MAGMA: magma },
      magma,
    ),
  ];
  const output = {
    schema: "sagejs.hyperelliptic-oracle-benchmark.v1",
    generated_at_utc: new Date().toISOString(),
    workload: {
      cases: "bench/hyperelliptic/cases-v1.json",
      cases_sha256: sha256(readFileSync(casesPath)),
      rows: JSON.parse(readFileSync(casesPath, "utf8")).cases.length,
      repeats_in_one_process: repeat,
      core_operations: "local polynomial, first g extension counts, and Jacobian order",
    },
    host: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      node: process.version,
    },
    interpretation: {
      process_wall_ms: "process startup plus every in-process repetition",
      first_algorithm_ms: "first corpus evaluation after imports/startup",
      warm_algorithm_samples_ms: "later evaluations in the same process",
    },
    results,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main();

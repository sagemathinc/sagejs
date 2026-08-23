#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const {
  arch,
  cpus,
  freemem,
  hostname,
  loadavg,
  platform,
  release,
  totalmem,
} = require("node:os");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const repository = resolve(__dirname, "../../..");
const addon = require(join(repository, "packages/flint/build/Release/sagejs_flint.node"));

function hashPacked(batch) {
  const hash = createHash("sha256");
  for (const array of [batch.primes, batch.good, batch.coefficientCounts, batch.coefficients, batch.rowStatus]) {
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
  return hash.digest("hex");
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function summary(values) {
  const center = median(values);
  return {
    median_ms: center,
    min_ms: Math.min(...values),
    max_ms: Math.max(...values),
    mad_ms: median(values.map((value) => Math.abs(value - center))),
    samples: values.length,
  };
}
function command(executable, args) {
  const result = spawnSync(executable, args, { cwd: repository, encoding: "utf8" });
  return {
    command: [executable, ...args].join(" "),
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}
function serialize(value) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
}
function parse() {
  const answer = { limits: [10_000, 100_000], repeat: 7, output: null };
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === "--limits") answer.limits = process.argv[++index].split(",").map(Number);
    else if (process.argv[index] === "--repeat") answer.repeat = Number(process.argv[++index]);
    else if (process.argv[index] === "--output") answer.output = resolve(process.argv[++index]);
    else throw new Error(`unknown argument ${process.argv[index]}`);
  }
  if (
    !answer.limits.length ||
    answer.limits.some((value) => !Number.isSafeInteger(value) || value <= 3)
  ) {
    throw new Error("limits must be safe integers greater than 3");
  }
  if (!Number.isSafeInteger(answer.repeat) || answer.repeat <= 0) {
    throw new Error("repeat must be a positive safe integer");
  }
  return answer;
}
function main() {
  const options = parse();
  const rows = [];
  addon.smalljacLpolyBatch("x^5+x+1", 3n, 101n);
  for (const limit of options.limits) {
    const samples = [];
    let expected = null;
    let result = null;
    for (let repetition = 0; repetition < options.repeat; repetition += 1) {
      const cpu = process.cpuUsage();
      const started = performance.now();
      const batch = addon.smalljacLpolyBatch("x^5+x+1", 3n, BigInt(limit));
      const elapsed = performance.now() - started;
      const used = process.cpuUsage(cpu);
      result = {
        rows: batch.rowCount,
        good_rows: Array.from(batch.good).reduce((sum, value) => sum + value, 0),
        exact_stream_sha256: hashPacked(batch),
      };
      if (expected === null) expected = result.exact_stream_sha256;
      if (result.exact_stream_sha256 !== expected) throw new Error(`nondeterministic stream through ${limit}`);
      samples.push({
        wall_ms: elapsed,
        cpu_user_ms: used.user / 1000,
        cpu_system_ms: used.system / 1000,
        rss_bytes: process.memoryUsage().rss,
      });
    }
    rows.push({
      limit,
      result,
      wall: summary(samples.map((value) => value.wall_ms)),
      cpu_user: summary(samples.map((value) => value.cpu_user_ms)),
      peak_rss_bytes: Math.max(...samples.map((value) => value.rss_bytes)),
      samples,
    });
  }
  const gitCommit = command("git", ["rev-parse", "HEAD"]);
  const gitStatus = command("git", ["status", "--short"]);
  const usage = process.resourceUsage();
  const output = {
    schema: "sagejs.hyperelliptic-competitive-local-streams.v1",
    generated_at_utc: new Date().toISOString(),
    source_commit: gitCommit.stdout,
    source_status: gitStatus.stdout,
    host: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      architecture: arch(),
      node: process.version,
      cpu: cpus()[0]?.model,
      logical_cpus: cpus().length,
      total_memory_bytes: totalmem(),
      free_memory_bytes: freemem(),
      load_average: loadavg(),
      preflight: [command("uptime", []), command("uname", ["-a"]), command("free", ["-b"])],
    },
    backend: addon.smalljacCapabilities(),
    resources: {
      peak_rss_kib: usage.maxRSS,
      user_seconds: usage.userCPUTime / 1e6,
      system_seconds: usage.systemCPUTime / 1e6,
    },
    contract: {
      curve: "y^2=x^5+x+1",
      interval: "[3,limit)",
      normalization: "det(1-T*Frob)",
      representation: "packed typed arrays; no public polynomial materialization",
    },
    rows,
  };
  const serialized = `${serialize(output)}\n`;
  if (options.output) writeFileSync(options.output, serialized);
  else process.stdout.write(serialized);
}
main();

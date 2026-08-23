#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { arch, hostname, platform, release } = require("node:os");
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
function median(values) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function summary(values) { const center = median(values); return { median_ms: center, min_ms: Math.min(...values), max_ms: Math.max(...values), mad_ms: median(values.map((value) => Math.abs(value - center))), samples: values.length }; }
function parse() {
  const answer = { limits: [10_000, 100_000], repeat: 7, output: null };
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === "--limits") answer.limits = process.argv[++index].split(",").map(Number);
    else if (process.argv[index] === "--repeat") answer.repeat = Number(process.argv[++index]);
    else if (process.argv[index] === "--output") answer.output = resolve(process.argv[++index]);
    else throw new Error(`unknown argument ${process.argv[index]}`);
  }
  return answer;
}
function main() {
  const options = parse(); const rows = [];
  addon.smalljacLpolyBatch("x^5+x+1", 3n, 101n);
  for (const limit of options.limits) {
    const samples = []; let expected = null; let result = null;
    for (let repetition = 0; repetition < options.repeat; repetition += 1) {
      const cpu = process.cpuUsage(); const started = performance.now();
      const batch = addon.smalljacLpolyBatch("x^5+x+1", 3n, BigInt(limit));
      const elapsed = performance.now() - started; const used = process.cpuUsage(cpu);
      result = { rows: batch.rowCount, good_rows: Array.from(batch.good).reduce((sum, value) => sum + value, 0), exact_stream_sha256: hashPacked(batch) };
      if (expected === null) expected = result.exact_stream_sha256;
      if (result.exact_stream_sha256 !== expected) throw new Error(`nondeterministic stream through ${limit}`);
      samples.push({ wall_ms: elapsed, cpu_user_ms: used.user / 1000, cpu_system_ms: used.system / 1000, rss_bytes: process.memoryUsage().rss });
    }
    rows.push({ limit, result, wall: summary(samples.map((value) => value.wall_ms)), cpu_user: summary(samples.map((value) => value.cpu_user_ms)), peak_rss_bytes: Math.max(...samples.map((value) => value.rss_bytes)), samples });
  }
  const output = { schema: "sagejs.hyperelliptic-competitive-local-streams.v1", generated_at_utc: new Date().toISOString(), source_commit: require("node:child_process").spawnSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).stdout.trim(), host: { hostname: hostname(), platform: platform(), release: release(), architecture: arch(), node: process.version }, backend: addon.smalljacCapabilities(), contract: { curve: "y^2=x^5+x+1", interval: "[3,limit)", normalization: "det(1-T*Frob)", representation: "packed typed arrays; no public polynomial materialization" }, rows };
  const serialized = `${JSON.stringify(output, null, 2)}\n`; if (options.output) writeFileSync(options.output, serialized); else process.stdout.write(serialized);
}
main();

#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const aggregate = require("./row19_phase6_prepared_aggregate_host.cjs");

const PROJECT = path.resolve(__dirname, "../..");
const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-19-ca58db0bc082112bf2922e3f5f4cf99fbaad71825a5650f6c32a29b3b8db6cdf.json";
const CACHE = "/scratch/sagejs-row19-phase6-prepared-aggregate/native-cache-v1";
const hash = value => crypto.createHash("sha256")
  .update(Buffer.from(JSON.stringify(value))).digest("hex");
const strings = owner => owner.toArray().map(String);

async function worker(input) {
  const prepared = JSON.parse(fs.readFileSync(input, "utf8"));
  const context = await aggregate.prepare(prepared, { cacheRoot: CACHE });
  global.gc?.();
  const before = process.resourceUsage();
  const started = process.hrtime.bigint();
  const live = aggregate.invokeNative(context);
  const elapsedNs = process.hrtime.bigint() - started;
  const after = process.resourceUsage();
  const result = aggregate.projectNative(live);
  const values = aggregate.liveOwners(result);
  assert.deepEqual(result.factorState,
    ["1", "3440", "3440", "424", "307", "307", "424", "3", "71",
      "424", "48", "4", "9820", "11920", "1842", "2200"]);
  assert.deepEqual(result.relationState, ["430", "4350", "0", "0", "430", "430"]);
  assert.deepEqual(result.firstHnfState, [9, 15, 408, 7, 6, 69, 0, 423, 0]);
  assert.deepEqual(result.terminalState, [9, 15, 415, 0, 6, 7, 0, 430, 0]);
  assert.deepEqual(result.terminalAcceptanceState, [2, 0, 0]);
  assert.deepEqual(result.invariants, ["6", "3", "3", "3", "3", "3", "3", "3", "3"]);
  assert.equal(result.classNumber, "39366");
  assert.deepEqual(result.classState,
    [0, 0, 9, 0, 2, 0, 0, 243, 0, 0, 9, 243]);
  assert.deepEqual(result.kernelState,
    [0, 424, 430, 6, 2112, 20, 78, 7, 84, 339, 16, 408]);
  assert.deepEqual(result.unitState, [0, 430, 6, 1, 352, 20, 1, 1, 192, 1]);
  assert.deepEqual(result.witnessState, [0, 9, 430, 424, 3180, 41, 3816, 3870, 1, 1]);
  assert.equal(hash(strings(values.kernel_kernel_output)),
    "5f81c98cc8390401c9ec319b320a218141a959833b71ff8055d879633000207f");
  assert.equal(hash(strings(values.unit_dependency_output)),
    "cc218d210f2a9e5400afa92c90365bfd528c9c14bb8e5e5255fa1b4807041343");
  assert.equal(hash(strings(values.unit_inverse_output)),
    "938f098a4c3d8347bc0290a0ee0d2c9189c499f50654bcaf8e744ea65d605abb");
  assert.equal(hash(strings(values.witness_coefficients_output)),
    "029449eb24fbf5654c4b3bb2dcec77aa012082674183fb244bf02e1a7fbf3c1c");
  assert.equal(hash(strings(values.witness_valuations_output)),
    "0f371fe920dfea58dee17f439eef453acd9c3c671284b62a9a36dfb2b5509d7c");
  assert.equal(result.nativeCallsInsideTimedBoundary, 1);
  assert.equal(result.nativeArtifactLookupsInsideTimedBoundary, 0);
  assert.equal(result.subprocessesInsideTimedBoundary, 0);
  assert.equal(result.serializedOwnersInsideTimedBoundary, 0);
  assert.equal(result.correspondenceComplete, true);
  assert.equal(result.publicComplete, false);
  process.stdout.write(`${JSON.stringify({ result, evidence: {
    kernelSha256: hash(strings(values.kernel_kernel_output)),
    dependencySha256: hash(strings(values.unit_dependency_output)),
    inverseSha256: hash(strings(values.unit_inverse_output)),
    principalCoefficientsSha256: hash(strings(values.witness_coefficients_output)),
    principalValuationsSha256: hash(strings(values.witness_valuations_output)),
  }, measurement: { elapsedNs: String(elapsedNs), maxRssKiB: after.maxRSS,
    userCpuMicros: after.userCPUTime - before.userCPUTime,
    systemCpuMicros: after.systemCPUTime - before.systemCPUTime } })}\n`);
}

async function main() {
  const input = process.argv[3] || process.argv[2] || DEFAULT_INPUT;
  if (process.argv[2] === "--worker") return worker(input);
  const prepared = JSON.parse(fs.readFileSync(input, "utf8"));
  const changed = structuredClone(prepared);
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  await assert.rejects(aggregate.prepare(changed, { cacheRoot: CACHE }));
  assert.throws(() => aggregate.invokeNative({}), /unbranded/);
  assert.throws(() => aggregate.projectNative({}), /unbranded/);
  assert.doesNotMatch(String(aggregate.invokeNative),
    /compileKernel|require\(|spawnSync|readFileSync|writeFileSync|gzip|gunzip/);
  assert.doesNotMatch(String(aggregate.invokeNative),
    /toArray|Array\.from|\.map\(|String\(/);
  const child = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, "--expose-gc", __filename,
    "--worker", input], { cwd: PROJECT, encoding: "utf8", timeout: 900_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072",
      SAGEJS_NATIVE_CACHE_DIR: CACHE } });
  assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
  const report = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  assert(report.result.ownerBytesUpperBound < 4 * 1024 ** 3);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

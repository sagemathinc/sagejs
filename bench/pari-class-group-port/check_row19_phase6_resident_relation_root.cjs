#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = require("./row19_phase6_resident_relation_root.cjs");

const PROJECT = path.resolve(__dirname, "../..");
const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-19-ca58db0bc082112bf2922e3f5f4cf99fbaad71825a5650f6c32a29b3b8db6cdf.json";
const ISOLATED_NATIVE_CACHE =
  "/scratch/sagejs-row19-phase6-resident/native-cache-v3";

async function worker(input) {
  const prepared = JSON.parse(fs.readFileSync(input, "utf8"));
  const context = await root.prepareResident(prepared);
  const startUsage = process.resourceUsage();
  const start = process.hrtime.bigint();
  const result = await root.runResident(context);
  const live = root.liveOwners(result);
  const elapsedNs = process.hrtime.bigint() - start;
  const usage = process.resourceUsage();
  assert.equal(result.serializedOwnersInsideRoot, 0);
  assert.equal(result.subprocessesInsideRoot, 0);
  assert.equal(result.duplicateFirstHnfExecutions, 0);
  assert.equal(live.completed.resident.collector.relation_records.toArray().length,
    424 * 4350);
  assert.equal(live.completed.resident.terminal.result_c.toArray().length,
    14 * 430);
  assert.deepEqual(result.firstHnf.state, [9, 15, 408, 7, 6, 69, 0, 423, 0]);
  assert.deepEqual(result.terminal.state, [9, 15, 415, 0, 6, 7, 0, 430, 0]);
  assert.deepEqual(result.terminal.attemptState, [3, 0, 0, 430]);
  assert.deepEqual(result.terminal.acceptanceState, [2, 0, 0]);
  assert.equal(result.terminal.classNumber, "39366");
  assert.deepEqual(result.terminal.relationState,
    ["430", "4350", "0", "0", "430", "430"]);
  assert.equal(result.firstHnf.resultSha256,
    "7c3dfa2c322d8071031e8c5d9dd230371841f851cd7949fb2365846fb00c2cb3");
  assert.equal(result.firstHnf.ancestrySha256,
    "5497e085401fd9c56090fb0d57f5eaeb22ebfb26ceb53c0cd3b9075bc3a389e0");
  assert.equal(result.terminal.resultSha256,
    "7613a87cb7005bd3c92c594a00bacb2a6ceb6a1cc9f7dd38dcc7562dd960cc8c");
  assert.equal(result.terminal.ancestrySha256,
    "d9fd91b5bab2247dba17b77edde25daa9a0e2f8227baeb441925c40fe3dd5b08");
  assert.equal(result.terminal.relationIdentitySha256,
    "17608bc125082b69104323ce6e84f9f3102562e284bfc03ec834485532be15ac");
  process.stdout.write(`${JSON.stringify({ result,
    measurement: { elapsedNs: String(elapsedNs), maxRssKiB: usage.maxRSS,
      userCpuMicros: usage.userCPUTime - startUsage.userCPUTime,
      systemCpuMicros: usage.systemCPUTime - startUsage.systemCPUTime } })}\n`);
}

async function main() {
  if (process.argv[2] === "--worker") return worker(process.argv[3] || DEFAULT_INPUT);
  const prepared = JSON.parse(fs.readFileSync(process.argv[2] || DEFAULT_INPUT, "utf8"));
  const changed = structuredClone(prepared);
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  await assert.rejects(root.prepareResident(changed));
  await assert.rejects(root.runResident({}), /unbranded/);
  const runSource = String(root.runResident);
  assert.doesNotMatch(runSource, /spawnSync|writeFileSync|readFileSync|gzip|gunzip/);
  const child = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, "--expose-gc", __filename,
    "--worker", process.argv[2] || DEFAULT_INPUT], { cwd: PROJECT,
    encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072",
      SAGEJS_NATIVE_CACHE_DIR: ISOLATED_NATIVE_CACHE } });
  assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
  const report = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  assert(report.result.ownerBytesUpperBound < 4 * 1024 ** 3);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

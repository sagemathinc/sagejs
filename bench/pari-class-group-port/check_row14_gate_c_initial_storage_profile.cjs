#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const RECEIPT = "/scratch/row14-gate-c-initial-storage-profile.json";
const EXPECTED_STATES = [
  [3, 10, 792, 4, 7, 105, 0, 802, 0],
  [4, 11, 793, 2, 7, 1, 0, 804, 0],
  [2, 9, 796, 1, 7, 3, 0, 805, 0],
  [3, 10, 796, 0, 7, 0, 0, 806, 0],
];
const EXPECTED_RESULT_SHA256 =
  "1c669dd03269ef25e1c79e08c104f416062465380964515c6079902a96aacfef";

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function worker() {
  const gate = require("./row14_prepared_gate_c_host.cjs");
  const timing = require("./row14_sage_prepared_timing_adapter.cjs");
  const { prepared, root } = timing.authenticateAndHydrate();
  const preparationStarted = process.hrtime.bigint();
  const kernels = await gate.warmPreparedGateC({ profile: true, prepared, root });
  const preparationNanoseconds = process.hrtime.bigint() - preparationStarted;
  const started = process.hrtime.bigint();
  const live = await gate.runPreparedGateC(prepared, root,
    { profile: true, kernels });
  const elapsedNanoseconds = process.hrtime.bigint() - started;

  assert.deepEqual(live.checkpoints.map(checkpoint => checkpoint.state), EXPECTED_STATES);
  assert.deepEqual(live.collectorValues.relation_state.toArray().map(String),
    ["806", "8110", "0", "0", "806", "806"]);
  assert.equal(live.collectionPasses, 8);
  const resultDigest = digest({
    checkpoints: live.checkpoints,
    relationState: live.collectorValues.relation_state.toArray().map(String),
    relationRecords: live.collectorValues.relation_records.toArray()
      .slice(0, 806 * 799).map(String),
    logs: live.collectorValues.log_embeddings.toArray()
      .slice(0, 806 * 3 * 7).map(String),
    rng: live.preparedRng,
  });
  assert.equal(resultDigest, EXPECTED_RESULT_SHA256);
  assert.deepEqual(live.initialStorageReuse, {
    strategy: "authenticated-resident-fixed-owner-envelope",
    ownerConstructionsOutsideRun: 198,
    bytes: 1518459964,
    elements: 21976375,
    consumedExactlyOnce: true,
  });
  assert.equal(live.profile.outer.some(row =>
    row.label === "initial.allocate-collector" ||
    row.label === "initial.allocate-hnfspec"), false);
  assert.equal(live.profile.outer.filter(row =>
    row.label === "initial.reset-and-load-hnfspec").length, 1);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-gate-c-initial-storage-profile-v1",
    qualification: false,
    purpose: "diagnostic confirmation of prepared initial typed storage",
    resultDigest,
    preparationNanoseconds: String(preparationNanoseconds),
    elapsedNanoseconds: String(elapsedNanoseconds),
    maximumRssKiB: process.resourceUsage().maxRSS,
    relationState: live.collectorValues.relation_state.toArray().map(String),
    checkpointStates: live.checkpoints.map(checkpoint => checkpoint.state),
    initialStorageReuse: live.initialStorageReuse,
    continuationStorageReuse: live.storageReuse,
    ownerBytesUpperBound: live.ownerBytesUpperBound,
    executionBoundary: live.executionBoundary,
    profile: live.profile,
  })}\n`);
}

function main() {
  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, __filename, "--worker"], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert.equal(result.schema,
    "sagejs.pari-class-group/row14-gate-c-initial-storage-profile-v1");
  assert.equal(result.qualification, false);
  assert(Number(result.maximumRssKiB) < 4 * 1024 * 1024);
  const receipt = { ...result, limits: {
    addressSpaceBytes: 4 * 1024 ** 3,
    rssBytes: 4 * 1024 ** 3,
    cpuSeconds: 600,
    wallTimeoutSeconds: 600,
    nodeOldSpaceMiB: 3072,
  } };
  fs.writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ receipt: RECEIPT,
    resultDigest: receipt.resultDigest,
    preparationNanoseconds: receipt.preparationNanoseconds,
    elapsedNanoseconds: receipt.elapsedNanoseconds,
    gateNanoseconds: receipt.profile.gateNanoseconds,
    maximumRssKiB: receipt.maximumRssKiB,
    initialStorageReuse: receipt.initialStorageReuse,
  }, null, 2)}\n`);
}

if (process.argv[2] === "--worker") worker().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
else main();

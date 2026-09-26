#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");

async function worker() {
  const { runProfile } = require("./row14_relation_hnf_profile_host.cjs");
  process.stdout.write(`${JSON.stringify(await runProfile(), null, 2)}\n`);
}

function main() {
  const run = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, __filename, "--worker"], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert.equal(result.schema, "sagejs.pari-class-group/row14-relation-hnf-profile-v1");
  assert(BigInt(result.profile.gateNanoseconds) > 0n);
  assert(result.profile.nativeCalls.length === 12);
  assert(result.profile.generatedCode.length === 3);
  assert(Number(result.maximumRssKiB) < 4 * 1024 * 1024);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[2] === "--worker") worker().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
else main();

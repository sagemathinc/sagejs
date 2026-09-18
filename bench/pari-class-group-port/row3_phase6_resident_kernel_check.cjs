#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const host = require("./row3_phase6_resident_kernel_host.cjs");
const pari = require("./row3_phase6_pari_prepared_adapter.cjs");

async function child() {
  const client = new pari.HelperClient(pari.buildHelper());
  await client.ready();
  let pariSample;
  try { pariSample = await client.run("1"); } finally { await client.close(); }
  const resident = await host.prepareResident();
  const first = host.runInvocation(resident);
  const second = host.runInvocation(resident);
  assert.deepEqual(second.projection, first.projection);
  assert.deepEqual(first.projection.field, pariSample.projection.field);
  assert.deepEqual(first.projection.classGroup, pariSample.projection.classGroup);
  assert.equal(pariSample.projection.unitGroup.rank, "2");
  assert.equal(pariSample.projection.unitGroup.regulatorPresent, true);
  assert.equal(first.executionBoundary.nativeCallsInsideClock, 1);
  assert.equal(first.executionBoundary.subprocessesInsideClock, false);
  assert.equal(first.executionBoundary.filesystemInsideClock, false);
  assert(BigInt(first.kernelNanoseconds) > 0n);
  assert(BigInt(second.kernelNanoseconds) > 0n);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row3-phase6-resident-kernel-check-v1",
    preparedAuthoritySha256: host.AUTHORITY,
    sageKernelNanoseconds: [first.kernelNanoseconds, second.kernelNanoseconds],
    pariKernelNanoseconds: pariSample.kernelNanoseconds,
    sageProjection: first.projection,
    pariProjection: pariSample.projection,
    commonClassProjectionMatched: true,
    residentReuseChecked: true,
    addressSpaceLimitBytes: "4294967296", cpuLimitSeconds: "600",
    wholeClassUnitBoundaryAvailable: false,
    qualifiedTiming: false, ratioPublished: false,
  })}\n`);
}

if (process.argv.includes("--bounded-child")) {
  child().catch(error => { console.error(error.stack || error); process.exit(1); });
} else {
  const run = spawnSync("/usr/bin/prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, __filename, "--bounded-child"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error || run.signal));
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.addressSpaceLimitBytes, "4294967296");
  assert.equal(receipt.cpuLimitSeconds, "600");
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { createExitBarrier, verifyChildObservation } = require("../../../scripts/package-qualification/memory-barrier.cjs");
const preload = require.resolve("../../../scripts/package-qualification/memory-barrier.cjs");

function subject(barrier, source) {
  return spawn(process.execPath, ["--require", preload, "-e", source], {
    env: { ...process.env, SAGEJS_SUBJECT_MEMORY_BARRIER: JSON.stringify(barrier.options) },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitReady(barrier) {
  for (let i = 0; i < 200; i++) {
    const markers = barrier.ready();
    if (markers.length) return markers;
    await delay(10);
  }
  throw new Error("subject did not reach exit boundary");
}

for (const explicit of [false, true]) {
  test(`short real child stays resident until observed; explicit exit=${explicit}`, async () => {
    const barrier = createExitBarrier();
    const child = subject(barrier, explicit ? "process.exit(3)" : "process.exitCode = 3");
    const closed = once(child, "close");
    try {
      const markers = await waitReady(barrier);
      assert.equal(markers[0].pid, child.pid);
      barrier.acknowledge(markers, [process.pid]);
      await delay(200);
      assert.equal(child.exitCode, null, "observing only supervisor must not release subject");
      process.kill(child.pid, 0);
      barrier.acknowledge(markers, [child.pid]);
      assert.equal((await closed)[0], 3);
      verifyChildObservation(barrier.options, child.pid);
    } finally { child.kill(); barrier.dispose(); }
  });
}

test("workers and grandchildren do not inherit an exit wait", async () => {
  const barrier = createExitBarrier();
  const child = subject(barrier, `
    const { Worker } = require('node:worker_threads');
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, ['--require', ${JSON.stringify(preload)}, '-e', '']);
    if (result.status !== 0) process.exit(4);
    new Worker('', { eval: true });
  `);
  const closed = once(child, "close");
  try {
    const markers = await waitReady(barrier);
    assert.equal(markers.length, 1);
    barrier.acknowledge(markers, [child.pid]);
    assert.equal((await closed)[0], 0);
    verifyChildObservation(barrier.options, child.pid);
  } finally { child.kill(); barrier.dispose(); }
});

test("absent collector fails closed and cannot be repaired by a late acknowledgement", async () => {
  const barrier = createExitBarrier({ timeoutMs: 100 });
  const child = subject(barrier, "");
  try {
    assert.equal((await once(child, "close"))[0], 70);
    barrier.acknowledge(barrier.ready(), [child.pid]);
    assert.throws(() => verifyChildObservation(barrier.options, child.pid), /not observed/);
    assert.throws(() => verifyChildObservation(barrier.options, process.pid), /did not enter/);
  } finally { child.kill(); barrier.dispose(); }
});

async function observeWindowsSubject(executable, args, extraBytes) {
  const { Worker } = require("node:worker_threads");
  const { qualificationInternals } = require("../../../scripts/numerical-computing/receipt.cjs");
  const baseline = process.memoryUsage().rss;
  const measurement = qualificationInternals.memoryMeasurement({ kind: "npm" });
  const worker = new Worker(`
    const { workerData, parentPort } = require('node:worker_threads');
    const runtime = require(workerData.runtime);
    const result = runtime.runProcess(workerData.executable, workerData.args,
      { memoryBarrier: workerData.barrier, timeout: 60000 });
    parentPort.postMessage(result);
  `, { eval: true, workerData: {
    runtime: require.resolve("../../../scripts/package-qualification/runtime.cjs"),
    barrier: measurement.barrier, executable, args,
  } });
  const result = once(worker, "message");
  const exit = once(worker, "exit");
  try {
    assert.equal((await result)[0].status, 0);
    assert.equal((await exit)[0], 0);
  } finally {
    await worker.terminate();
    const peak = measurement.finish();
    assert.equal(peak.measurement_method, "windows-cim-process-tree-sampled-v1");
    assert.ok(peak.bytes >= baseline + extraBytes,
      `sampled ${peak.bytes} bytes above baseline ${baseline}`);
  }
}

test("Windows CIM observes a short supervised subject's touched memory", {
  skip: process.platform !== "win32" ? "Windows process-table collector regression" : false,
}, async () => {
  await observeWindowsSubject(process.execPath,
    ["-e", "global.bytes = Buffer.alloc(64 * 1024 * 1024, 1);"], 32 * 1024 * 1024);
});

test("Windows SEA supports the same real-subject observation barrier", {
  skip: process.platform !== "win32" || !process.env.SAGEJS_TEST_MEMORY_SEA
    ? "set SAGEJS_TEST_MEMORY_SEA to a built Windows SEA for product validation" : false,
}, async () => {
  await observeWindowsSubject(process.env.SAGEJS_TEST_MEMORY_SEA, ["--version"], 0);
});

// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const { Worker } = require("node:worker_threads");
const test = require("node:test");
const { closeKernelWorker } = require("../dist/tools/kernel-worker-lifecycle.js");

async function start(t, source, workerData) {
  const worker = new Worker(source, { eval: true, workerData });
  t.after(() => worker.terminate());
  await once(worker, "message");
  return worker;
}

test("normal close runs worker cleanup and waits for natural exit", async (t) => {
  const buffer = new SharedArrayBuffer(4);
  const worker = await start(t, `
    const {parentPort, workerData} = require('node:worker_threads');
    parentPort.on('message', m => {
      if (m.type === 'close') {
        setTimeout(() => {
          Atomics.store(new Int32Array(workerData), 0, 1);
          parentPort.close();
        }, 20);
      }
    });
    parentPort.postMessage('ready');
  `, buffer);
  let exitCode;
  worker.once("exit", code => exitCode = code);
  await closeKernelWorker(worker);
  assert.equal(Atomics.load(new Int32Array(buffer), 0), 1);
  assert.equal(exitCode, 0);
  assert.equal(worker.threadId, -1);
});

test("close forcibly stops a worker that cannot process messages", async (t) => {
  const worker = await start(t, `
    require('node:worker_threads').parentPort.postMessage('ready');
    while (true) {}
  `);
  await closeKernelWorker(worker, 25);
  assert.equal(worker.threadId, -1);
});

test("close handles workers that have already exited", async (t) => {
  const worker = await start(t, `
    require('node:worker_threads').parentPort.postMessage('ready');
  `);
  await worker.terminate();
  await closeKernelWorker(worker);
  assert.equal(worker.threadId, -1);
});

test("failed close-message delivery falls back to termination", async (t) => {
  const worker = await start(t, `
    require('node:worker_threads').parentPort.postMessage('ready');
    setInterval(() => {}, 1000);
  `);
  worker.postMessage = () => { throw new Error("closed port"); };
  await closeKernelWorker(worker);
  assert.equal(worker.threadId, -1);
});

// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Worker } from "node:worker_threads";

const artifact = new URL(
  "../../packages/flint-wasm/numerical/build/cminpack.wasm",
  import.meta.url,
);
const fixture = new URL("./node-worker-fixture.mjs", import.meta.url);

function nextMessage(worker, expected) {
  return new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message.kind === "error") {
        cleanup();
        reject(Object.assign(new Error(message.error.message), message.error));
      } else if (message.kind === expected) {
        cleanup();
        resolve(message);
      }
    };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
  });
}

async function initializedWorker() {
  const worker = new Worker(fixture);
  worker.postMessage({ kind: "initialize", artifact: await readFile(artifact) });
  await nextMessage(worker, "ready");
  return worker;
}

test("worker-owned callbacks support out-of-band cooperative cancellation", async () => {
  const worker = await initializedWorker();
  try {
    const cancellation = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    worker.postMessage({ kind: "cancel", cancellation });
    await nextMessage(worker, "evaluating");
    Atomics.store(new Int32Array(cancellation), 0, 1);
    const stopped = await nextMessage(worker, "result");
    assert.equal(stopped.result.status, "cancelled");
    assert.equal(stopped.result.value, undefined);
    assert.equal(stopped.inspect.liveAllocations, 0);
    assert.equal(stopped.inspect.liveBytes, 0);

    worker.postMessage({ kind: "rosenbrock" });
    const recovered = await nextMessage(worker, "result");
    assert.equal(recovered.result.backendConverged, true);
    assert.deepEqual(recovered.result.value, [1, 1]);
    assert.equal(recovered.inspect.liveAllocations, 0);
  } finally {
    await worker.terminate();
  }
});

test("a hard-stuck evaluator worker can be terminated and recreated", async () => {
  const stuck = await initializedWorker();
  stuck.postMessage({ kind: "hang" });
  await nextMessage(stuck, "hanging");
  await stuck.terminate();

  const replacement = await initializedWorker();
  try {
    replacement.postMessage({ kind: "rosenbrock" });
    const recovered = await nextMessage(replacement, "result");
    assert.equal(recovered.result.backendConverged, true);
    assert.deepEqual(recovered.result.value, [1, 1]);
    assert.equal(recovered.inspect.liveAllocations, 0);
    assert.equal(recovered.inspect.liveBytes, 0);
  } finally {
    await replacement.terminate();
  }
});

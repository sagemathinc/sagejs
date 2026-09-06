import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {createSpecialistBytes, fetchSpecialistBytes} from "../specialist-bytes.mjs";
import {NodeWebWorker} from "../node-worker.mjs";

const bytes = Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]);
const receipt = {bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex")};
const url = "data:application/wasm;base64," + Buffer.from(bytes).toString("base64");

test("authenticates a bounded byte stream and rejects corruption/truncation/overflow", async () => {
  assert.deepEqual(await fetchSpecialistBytes(url, receipt), bytes);
  for (const value of [bytes.slice(1), new Uint8Array(9), new Uint8Array(8)]) {
    await assert.rejects(fetchSpecialistBytes(url, receipt, {
      fetchImpl: async () => new Response(value),
    }), /size|SHA-256/);
  }
  for (const value of [0, -1, 33554433, 1.5]) {
    await assert.rejects(fetchSpecialistBytes(url, {...receipt, bytes: value}), /receipt/);
  }
  await assert.rejects(fetchSpecialistBytes(url, receipt, {
    fetchImpl: async () => new Response(null, {status: 404}),
  }), /download failed/);
});

test("private worker fetches only on first synchronous access", async () => {
  const loader = createSpecialistBytes(url, receipt, {WorkerConstructor: NodeWebWorker});
  try {
    await loader.ready;
    assert.deepEqual(loader.status(), {loaded: false, requests: 0, mode: "on-demand"});
    const result = loader.get();
    assert.deepEqual(result, bytes);
    assert.equal(loader.get(), result);
    assert.equal(loader.status().requests, 1);
    assert.ok(new WebAssembly.Module(result));
  } finally { loader.close(); }
  assert.throws(() => loader.get(), /closed/);
});

test("worker digest failure is terminal and never repeats a download", async () => {
  const loader = createSpecialistBytes(url, {...receipt, sha256: "0".repeat(64)}, {WorkerConstructor: NodeWebWorker});
  try {
    await loader.ready;
    assert.throws(() => loader.get(), /SHA-256/);
    assert.throws(() => loader.get(), /SHA-256/);
    assert.equal(loader.status().requests, 1);
  } finally { loader.close(); }
});

test("no shared memory preloads exactly once before synchronous evaluation", async () => {
  let calls = 0;
  const loader = createSpecialistBytes(url, receipt, {shared: false,
    fetchImpl: async () => {calls++; return new Response(bytes);},
  });
  assert.throws(() => loader.get(), /not ready/);
  await loader.ready;
  assert.deepEqual(loader.get(), bytes);
  assert.deepEqual(loader.status(), {loaded: true, requests: 1, mode: "preload"});
  assert.equal(calls, 1);
  loader.close();
});

test("closing during worker startup rejects readiness instead of leaking a timer", async () => {
  const loader = createSpecialistBytes(url, receipt, {WorkerConstructor: NodeWebWorker});
  const rejected = assert.rejects(loader.ready, /closed before initialization/);
  loader.close();
  await rejected;
});

test("synchronous timeout is bounded and terminal", async () => {
  let terminations = 0;
  class SilentWorker {
    constructor() {queueMicrotask(() => this.onmessage({data: {type: "specialist-worker-ready"}}));}
    postMessage() {}
    terminate() {terminations++;}
  }
  const loader = createSpecialistBytes(url, receipt, {
    WorkerConstructor: SilentWorker, timeoutMilliseconds: 5,
  });
  await loader.ready;
  assert.throws(() => loader.get(), /timed out/);
  assert.throws(() => loader.get(), /timed out/);
  assert.equal(loader.status().requests, 1);
  assert.equal(terminations, 1);
  loader.close();
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  ClassGroupCoreClosedError,
  ClassGroupCoreInterruptedError,
  ClassGroupCoreService,
} from "../class-group-core.mjs";

const receipt = Object.freeze({ bytes: 8, sha256: "a".repeat(64) });

function fakeWorkers({ initialize = true } = {}) {
  const workers = [];
  class FakeWorker {
    constructor() {
      this.generation = workers.length + 1;
      this.terminated = false;
      workers.push(this);
    }

    postMessage(message) {
      if (message.type === "initialize") {
        this.initialization = message;
        if (!initialize) return;
        queueMicrotask(() => this.onmessage?.({
          data: {
            type: "ready",
            protocol: 1,
            diagnostics: {
              abiVersion: 1,
              cancellation: "worker-termination",
              memoryPages: 256,
            },
          },
        }));
        return;
      }
      if (message.type === "close") return;
      if (message.type === "diagnostics") {
        queueMicrotask(() => this.onmessage?.({
          data: {
            type: "result",
            id: message.id,
            ok: true,
            result: {
              abiVersion: 1,
              cancellation: "worker-termination",
              memoryPages: 256,
            },
          },
        }));
        return;
      }
      if (message.request?.hang) return;
      let result = { echo: message.request, generation: this.generation };
      const serviceRequest = message.request?.schema ===
        "sagejs.class-groups/service-request-v1";
      if (serviceRequest && message.request.operation === "open") {
        result = { outcome: "open", generation: "1", handle: "7", maximumResidentSessions: 4 };
      } else if (serviceRequest && message.request.operation === "query") {
        result = { outcome: "complete-conditional-grh-ideal-class", handle: "7" };
      } else if (serviceRequest && message.request.operation === "summary") {
        result = {
          schema: "sagejs.class-groups/compact-summary-v1",
          outcome: "complete-conditional-grh",
        };
      } else if (serviceRequest && message.request.operation === "publication") {
        result = {
          schema: "sagejs.rust-class-group/public-cubic-publication-candidate-v2",
          status: "detached-replay-required-before-publication",
        };
      } else if (serviceRequest && message.request.operation === "close") {
        result = { outcome: "closed", handle: "7" };
      }
      if (serviceRequest) {
        result = {
          schema: "sagejs.class-groups/service-response-v1",
          abi: 1,
          id: message.request.id,
          ok: true,
          result,
        };
      }
      queueMicrotask(() => this.onmessage?.({
        data: { type: "result", id: message.id, ok: true, result },
      }));
    }

    terminate() {
      this.terminated = true;
    }
  }
  return { FakeWorker, workers };
}

test("the service authenticates configuration and exposes diagnostics", async () => {
  const { FakeWorker, workers } = fakeWorkers();
  const service = new ClassGroupCoreService({
    artifact: "https://example.invalid/class-group.wasm",
    receipt,
    WorkerConstructor: FakeWorker,
  });
  try {
    await service.ready();
    assert.deepEqual(workers[0].initialization.receipt, receipt);
    assert.equal((await service.invoke({ value: 3 })).echo.value, 3);
    assert.deepEqual(await service.diagnostics(), {
      route: "rust-class-group-worker",
      generation: 1,
      artifact: {
        url: "https://example.invalid/class-group.wasm",
        ...receipt,
      },
      abiVersion: 1,
      cancellation: "worker-termination",
      memoryPages: 256,
    });
  } finally {
    await service.close();
  }
  assert.equal(workers[0].terminated, true);
});

test("abort terminates the synchronous worker and invalidates resident handles", async () => {
  const { FakeWorker, workers } = fakeWorkers();
  const service = new ClassGroupCoreService({
    artifact: "https://example.invalid/class-group.wasm",
    receipt,
    WorkerConstructor: FakeWorker,
  });
  try {
    const session = await service.open({ field: "cubic" });
    assert.equal(session.handle, "7");
    assert.equal(
      (await session.query([["1"]], { factorBase: [] })).outcome,
      "complete-conditional-grh-ideal-class",
    );
    assert.equal(
      (await session.publication()).status,
      "detached-replay-required-before-publication",
    );
    const summary = await session.summary();
    assert.equal(summary.schema, "sagejs.class-groups/compact-summary-v1");
    assert.equal(summary.artifactSha256, receipt.sha256);

    const controller = new AbortController();
    const computation = service.invoke({ hang: true }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await assert.rejects(computation, (error) => error.name === "AbortError");
    assert.equal(workers[0].terminated, true);
    await service.ready();
    assert.equal(workers.length, 2);
    assert.throws(() => session.query([], {}), ClassGroupCoreInterruptedError);
  } finally {
    await service.close();
  }
});

test("session close is idempotent and service close rejects later work", async () => {
  const { FakeWorker } = fakeWorkers();
  const service = new ClassGroupCoreService({
    artifact: "https://example.invalid/class-group.wasm",
    receipt,
    WorkerConstructor: FakeWorker,
  });
  const session = await service.open({ field: "cubic" });
  await session.close();
  await session.close();
  assert.throws(() => session.query([], {}), ClassGroupCoreClosedError);
  await service.close();
  await service.close();
  await assert.rejects(service.invoke({}), ClassGroupCoreClosedError);
});

test("invalid artifact receipts fail before a worker is created", () => {
  const { FakeWorker, workers } = fakeWorkers();
  assert.throws(
    () => new ClassGroupCoreService({
      artifact: "https://example.invalid/class-group.wasm",
      receipt: { bytes: 0, sha256: "not-a-digest" },
      WorkerConstructor: FakeWorker,
    }),
    /invalid bounded specialist byte receipt/,
  );
  assert.equal(workers.length, 0);
});

test("abort while the artifact initializes retires that worker generation", async () => {
  const { FakeWorker, workers } = fakeWorkers({ initialize: false });
  const service = new ClassGroupCoreService({
    artifact: "https://example.invalid/class-group.wasm",
    receipt,
    WorkerConstructor: FakeWorker,
  });
  const controller = new AbortController();
  const request = service.invoke({ value: 1 }, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(request, (error) => error.name === "AbortError");
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2);
  await service.close();
});

test("a post-ready worker crash rejects work and starts a fresh generation", async () => {
  const { FakeWorker, workers } = fakeWorkers();
  const service = new ClassGroupCoreService({
    artifact: "https://example.invalid/class-group.wasm",
    receipt,
    WorkerConstructor: FakeWorker,
  });
  await service.ready();
  const pending = service.invoke({ hang: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  workers[0].onerror({ error: new Error("worker crashed") });
  await assert.rejects(pending, /worker crashed/);
  await service.ready();
  assert.equal(service.generation, 2);
  assert.equal(workers[0].terminated, true);
  assert.equal((await service.invoke({ value: 9 })).echo.value, 9);
  await service.close();
});

test("the factory defaults to packaged authenticated artifact URLs", async () => {
  const { FakeWorker, workers } = fakeWorkers();
  const service = new ClassGroupCoreService({ WorkerConstructor: FakeWorker });
  try {
    await service.ready();
    assert.match(workers[0].initialization.artifact, /\/dist\/class-group-core\.wasm$/);
    assert.match(
      workers[0].initialization.receipt,
      /\/dist\/class-group-core-receipt\.json$/,
    );
    const diagnostics = await service.diagnostics();
    assert.match(diagnostics.artifact.receiptUrl, /class-group-core-receipt\.json$/);
  } finally {
    await service.close();
  }
});

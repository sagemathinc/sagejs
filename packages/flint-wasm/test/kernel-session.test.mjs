import assert from "node:assert/strict";
import test from "node:test";

import {
  SageSession,
  SageSessionInterruptedError,
} from "../kernel.mjs";

test("interrupt acknowledges termination before replacement readiness", async () => {
  const originalWorker = globalThis.Worker;
  const workers = [];

  class TestWorker {
    constructor() {
      this.index = workers.length;
      this.terminated = false;
      workers.push(this);
    }

    postMessage(message, ports) {
      assert.equal(message.type, "initialize");
      this.port = ports[0];
      this.port.onmessage = ({ data }) => {
        if (data.type !== "evaluate" || data.source === "hang") return;
        this.port.postMessage({
          type: "result",
          id: data.id,
          ok: true,
          result: { repr: "done", saveRequests: [] },
        });
      };
      this.port.start?.();
      setTimeout(() => {
        this.port.postMessage({ type: "ready", protocol: 3 });
      }, this.index === 0 ? 0 : 80);
    }

    terminate() {
      this.terminated = true;
      this.port?.close();
    }
  }

  globalThis.Worker = TestWorker;
  const session = new SageSession({ worker: "test-worker.mjs" });
  try {
    await session.ready();
    const evaluation = session.evaluate("hang");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const started = performance.now();
    await session.interrupt();
    assert.ok(performance.now() - started < 40);
    await assert.rejects(evaluation, SageSessionInterruptedError);
    assert.equal(workers[0].terminated, true);

    const replacementStarted = performance.now();
    assert.equal((await session.evaluate("done")).repr, "done");
    assert.ok(performance.now() - replacementStarted >= 60);
  } finally {
    await session.close();
    globalThis.Worker = originalWorker;
  }
});

test("session configures a validated compiler-worker optimizer policy", async () => {
  const originalWorker = globalThis.Worker;
  let initialized;

  class TestWorker {
    postMessage(message, ports) {
      initialized = message;
      this.port = ports[0];
      this.port.onmessage = ({ data }) => {
        if (data.type !== "evaluate") return;
        this.port.postMessage({
          type: "result",
          id: data.id,
          ok: true,
          result: { repr: "done", saveRequests: [] },
        });
      };
      this.port.start?.();
      setTimeout(() => {
        this.port.postMessage({ type: "ready", protocol: 3 });
      }, 0);
    }

    terminate() {
      this.port?.close();
    }
  }

  globalThis.Worker = TestWorker;
  const session = new SageSession({
    worker: "test-worker.mjs",
    compilerWorker: "compiler-worker.mjs",
    optimizationLevel: "O0",
  });
  try {
    await session.ready();
    await session.evaluate("done");
    assert.equal(
      new URL(initialized.compilerWorker).searchParams.get(
        "sagejsOptimizationLevel",
      ),
      "O0",
    );
    assert.throws(
      () => new SageSession({ optimizationLevel: "fast" }),
      /optimizationLevel must be O0, O1, O2, O3, or Os/,
    );
  } finally {
    await session.close();
    globalThis.Worker = originalWorker;
  }
});

test("session routes comm requests and unsolicited worker events", async () => {
  const originalWorker = globalThis.Worker;
  class TestWorker {
    postMessage(message, ports) {
      this.port = ports[0];
      this.port.onmessage = ({ data }) => {
        if (data.type === "commInfo") {
          this.port.postMessage({
            type: "result",
            id: data.id,
            ok: true,
            result: { widget: { targetName: "jupyter.widget" } },
          });
        } else if (data.type === "comm") {
          this.port.postMessage({
            type: "comm-event",
            id: data.id,
            event: { schema: "sagejs.comm-event/v1", type: "message" },
          });
          this.port.postMessage({
            type: "output-event",
            id: data.id,
            event: {
              schema: "sagejs.output-event/v1",
              type: "display_data",
              parentId: "widget-change",
              data: { "text/plain": "updated" },
            },
          });
          this.port.postMessage({
            type: "result",
            id: data.id,
            ok: true,
          });
        }
      };
      this.port.start?.();
      setTimeout(() => this.port.postMessage({ type: "ready", protocol: 3 }), 0);
    }

    terminate() {
      this.port?.close();
    }
  }
  globalThis.Worker = TestWorker;
  const session = new SageSession({ worker: "test-worker.mjs" });
  const received = [];
  const output = [];
  session.on("comm", (value) => received.push(value));
  try {
    assert.deepEqual(await session.commInfo(), {
      widget: { targetName: "jupyter.widget" },
    });
    await session.comm({
      schema: "sagejs.comm-event/v1",
      type: "message",
      commId: "widget",
      data: {},
      metadata: {},
      buffers: [],
    }, {
      onEvent: (event) => output.push(event),
    });
    assert.equal(received.length, 1);
    assert.equal(output[0].data["text/plain"], "updated");
  } finally {
    await session.close();
    globalThis.Worker = originalWorker;
  }
});

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
        this.port.postMessage({ type: "ready", protocol: 2 });
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

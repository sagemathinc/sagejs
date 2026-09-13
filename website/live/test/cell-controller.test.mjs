import assert from "node:assert/strict";
import test from "node:test";

import { createSageCellController } from "../cell-controller.mjs";

class FakeSession {
  listeners = new Map();
  resets = 0;
  interrupts = 0;
  closes = 0;

  on(type, listener) {
    this.listeners.set(type, listener);
  }

  off(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  async evaluate(source, options) {
    options.onOutput?.("stream\n");
    options.onEvent?.({ schema: "sagejs.output-event/v1", type: "display_data" });
    return { repr: source, events: [], commEvents: [], durationMs: 1 };
  }

  async comm() {}

  async interrupt() {
    this.interrupts += 1;
  }

  async reset() {
    this.resets += 1;
  }

  async close() {
    this.closes += 1;
  }
}

test("cell controller owns execution events, reset, snapshot, and disposal", async () => {
  const session = new FakeSession();
  const events = [];
  const controller = createSageCellController({
    async loadRuntime() {
      return { async createSage() { return session; } };
    },
    async loadWidgets() {
      return { createWidgetManager() { return { async render() {} }; } };
    },
  });
  for (const type of [
    "capability",
    "ready",
    "idle",
    "busy",
    "output",
    "result",
    "reset",
    "dispose",
  ]) {
    controller.addEventListener(type, (event) => events.push([type, event.detail]));
  }

  const result = await controller.run("2 + 2", { timeout: 100 });
  assert.equal(result.repr, "2 + 2");
  assert.deepEqual(
    events.map(([type]) => type),
    ["capability", "ready", "idle", "busy", "output", "output", "result", "idle"],
  );
  assert.equal(events.find(([type]) => type === "output")[1].text, "stream\n");

  const snapshot = controller.snapshot({
    source: "factor(2026)",
    configuration: { theme: "system" },
  });
  assert.deepEqual(snapshot, {
    schema: "org.sagejs.cell-snapshot/v1",
    source: "factor(2026)",
    configuration: { theme: "system" },
  });

  await controller.reset();
  await controller.interrupt();
  assert.equal(session.resets, 1);
  assert.equal(session.interrupts, 1);
  await controller.dispose();
  await controller.dispose();
  assert.equal(session.closes, 1);
  await assert.rejects(() => controller.run("1 + 1"), /disposed/);
});

test("cell controller rejects overlapping execution", async () => {
  const session = new FakeSession();
  let release;
  session.evaluate = () => new Promise((resolve) => {
    release = () => resolve({ repr: "done", events: [], commEvents: [] });
  });
  const controller = createSageCellController({
    async loadRuntime() {
      return { async createSage() { return session; } };
    },
    async loadWidgets() {
      return { createWidgetManager() { return { async render() {} }; } };
    },
  });
  const first = controller.run("first");
  await controller.ready();
  await assert.rejects(() => controller.run("second"), /already running/);
  release();
  await first;
  await controller.dispose();
});

test("cell controller forwards language mode into session construction", async () => {
  let options;
  const session = new FakeSession();
  const controller = createSageCellController({
    sessionOptions: { mode: "python", marker: 7 },
    loadRuntime: async () => ({
      createSage: async (value) => {
        options = value;
        return session;
      },
    }),
    loadWidgets: async () => ({}),
  });
  await controller.ready();
  assert.equal(options.mode, "python");
  assert.equal(options.marker, 7);
  assert.equal(options.onGraphicsSave, undefined);
  await controller.dispose();
});

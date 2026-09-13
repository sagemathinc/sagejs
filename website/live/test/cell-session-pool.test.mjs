import assert from "node:assert/strict";
import test from "node:test";

import { createCellSessionPool } from "../cell-session-pool.mjs";

function fakeControllerFactory(created) {
  return (options) => {
    let release;
    const controller = {
      disposed: 0,
      options,
      ready: async () => controller,
      run: async (source) => {
        if (source === "wait") {
          await new Promise((resolve) => { release = resolve; });
        }
        return { repr: source };
      },
      widgetHost: {
        render: async (_data, destination) => ({ destination }),
      },
      dispose: async () => { controller.disposed += 1; },
      releaseRun: () => release?.(),
    };
    created.push(controller);
    return controller;
  };
}

const handlers = {
  downloadGraphics: async () => undefined,
  renderWidgetOutput: async () => undefined,
};

test("named cells share one controller and release it after the final owner", async () => {
  const created = [];
  const pool = createCellSessionPool({ controllerFactory: fakeControllerFactory(created) });
  const first = pool.acquire({ ...handlers, name: "lesson", owner: {} });
  const second = pool.acquire({ ...handlers, name: "lesson", owner: {} });
  assert.equal(first.controller, second.controller);
  assert.deepEqual(pool.stats().sessions, [{
    busy: false,
    language: "sage",
    name: "lesson",
    references: 2,
  }]);
  assert.equal(await first.release(), false);
  assert.equal(created[0].disposed, 0);
  assert.equal(await second.release(), true);
  assert.equal(created[0].disposed, 1);
  assert.equal(pool.stats().liveSessions, 0);
});

test("shared execution is serialized and carries the active graphics owner", async () => {
  const created = [];
  const downloads = [];
  const widgetRenders = [];
  const pool = createCellSessionPool({ controllerFactory: fakeControllerFactory(created) });
  const firstOwner = { id: "first" };
  const secondOwner = { id: "second" };
  const options = {
    downloadGraphics: async (owner, request) => downloads.push([owner.id, request]),
    renderWidgetOutput: async (owner, output, destination) => {
      widgetRenders.push([owner.id, output, destination]);
    },
    name: "chapter",
  };
  const first = pool.acquire({ ...options, owner: firstOwner });
  const second = pool.acquire({ ...options, owner: secondOwner });
  const order = [];
  const originalRun = created[0].run;
  created[0].run = async (source) => {
    order.push(`start:${source}`);
    const result = await originalRun(source);
    order.push(`end:${source}`);
    return result;
  };
  const waiting = first.run("wait");
  const queued = second.run("next");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["start:wait"]);
  await created[0].options.onGraphicsSave("plot");
  assert.deepEqual(downloads, [["first", "plot"]]);
  created[0].releaseRun();
  await Promise.all([waiting, queued]);
  assert.deepEqual(order, ["start:wait", "end:wait", "start:next", "end:next"]);
  const destination = {};
  await second.renderWidget("model", destination);
  await created[0].options.renderWidgetOutput("late output", destination);
  assert.deepEqual(widgetRenders, [["second", "late output", destination]]);
  await first.release();
  await second.release();
});

test("independent cells, language mismatches, and pool limits are explicit", async () => {
  const created = [];
  const pool = createCellSessionPool({
    controllerFactory: fakeControllerFactory(created),
    limits: { liveSessions: 2, sharedSessions: 1 },
  });
  const independent = pool.acquire({ ...handlers, owner: {} });
  const python = pool.acquire({ ...handlers, language: "python", name: "python", owner: {} });
  assert.notEqual(independent.controller, python.controller);
  assert.equal(created[1].options.sessionOptions.mode, "python");
  assert.throws(
    () => pool.acquire({ ...handlers, language: "sage", name: "python", owner: {} }),
    /already uses python/,
  );
  assert.throws(
    () => pool.acquire({ ...handlers, name: "another", owner: {} }),
    /named-session limit/,
  );
  assert.throws(
    () => pool.acquire({ ...handlers, owner: {} }),
    /live-session limit/,
  );
  await independent.release();
  await python.release();
});

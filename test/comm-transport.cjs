// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const event = (type, fields) => ({
  schema: "sagejs.comm-event/v1",
  type,
  data: {},
  metadata: {},
  buffers: [],
  ...fields,
});

test("kernel comms exchange JSON and exact binary buffers", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const published = [];
  session.on("comm", (message) => published.push(message));

  const created = await session.evaluate(
    [
      "from IPython import get_ipython",
      "import comm",
      "received = []",
      "channel = comm.create_comm(target_name='sagejs.test', comm_id='kernel-one', data={'value': 1}, buffers=[b'\\x00\\xff'])",
      "def receive(message):",
      "    received.append(message['content']['data']['value'])",
      "    channel.send(data={'echo': received[-1]}, buffers=message['buffers'])",
      "channel.on_msg(receive)",
    ].join("\n"),
    { parentId: "create-cell" },
  );

  assert.equal(created.commEvents.length, 1);
  assert.equal(created.commEvents[0].type, "open");
  assert.equal(created.commEvents[0].commId, "kernel-one");
  assert.equal(created.commEvents[0].targetName, "sagejs.test");
  assert.deepEqual(Array.from(created.commEvents[0].buffers[0]), [0, 255]);
  assert.deepEqual(await session.commInfo(), {
    "kernel-one": { targetName: "sagejs.test" },
  });
  assert.deepEqual(await session.commInfo("different.target"), {});

  await session.comm(
    event("message", {
      parentId: "slider-change",
      commId: "kernel-one",
      data: { value: 37 },
      buffers: [Uint8Array.from([3, 1, 4, 1, 5])],
    }),
  );
  const reply = published.at(-1);
  assert.equal(reply.type, "message");
  assert.equal(reply.parentId, "slider-change");
  assert.deepEqual(reply.data, { echo: 37 });
  assert.deepEqual(Array.from(reply.buffers[0]), [3, 1, 4, 1, 5]);
  assert.equal((await session.evaluate("received")).repr, "[37]");

  await session.comm(event("close", { commId: "kernel-one" }));
  assert.deepEqual(await session.commInfo(), {});
});

test("frontend comm targets open, reply, and close without Jupyter", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const published = [];
  session.on("comm", (message) => published.push(message));
  await session.evaluate(
    [
      "from IPython import get_ipython",
      "import comm",
      "opened = []",
      "def open_target(channel, message):",
      "    opened.append(message['content']['data']['seed'])",
      "    channel.on_msg(lambda incoming: channel.send({'answer': incoming['content']['data']['question'] + 1}))",
      "comm.get_comm_manager().register_target('frontend.test', open_target)",
    ].join("\n"),
  );
  await session.comm(
    event("open", {
      commId: "frontend-one",
      targetName: "frontend.test",
      data: { seed: 9 },
    }),
  );
  assert.deepEqual(await session.commInfo(), {
    "frontend-one": { targetName: "frontend.test" },
  });
  await session.comm(
    event("message", {
      commId: "frontend-one",
      data: { question: 41 },
    }),
  );
  assert.deepEqual(published.at(-1).data, { answer: 42 });
  assert.equal((await session.evaluate("opened")).repr, "[9]");
  await session.comm(event("close", { commId: "frontend-one" }));
});

test("comm host boundary rejects invalid and oversized input", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  await session.evaluate("from IPython import get_ipython");
  await assert.rejects(
    session.comm(event("message", { commId: "", data: {} })),
    /comm id must be a nonempty string/,
  );
  await assert.rejects(
    session.comm(
      event("message", {
        commId: "missing",
        buffers: Array.from({ length: 65 }, () => new Uint8Array()),
      }),
    ),
    /exceeds 64 buffers/,
  );
});

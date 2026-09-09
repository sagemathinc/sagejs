// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createSage, SageSessionClosedError } = require("../dist/tools/kernel.js");

test("session close awaits natural worker exit and is shared by concurrent callers", async () => {
  const session = await createSage();
  try {
    assert.equal((await session.evaluate("1+1")).repr, "2");
    const worker = session.worker;
    const exit = once(worker, "exit");
    const closing = session.close();
    assert.equal(session.close(), closing);
    await closing;
    assert.deepEqual(await exit, [0], "idle workers must not be forcibly terminated");
    assert.equal(worker.threadId, -1);
    await assert.rejects(session.evaluate("2+2"), SageSessionClosedError);
  } finally {
    await session.close();
  }
});

test("session close rejects a busy evaluation and still finishes", { timeout: 15000 }, async () => {
  const session = await createSage();
  try {
    const started = once(session, "stdout");
    const evaluation = session.evaluate("print('running')\nwhile True:\n    pass");
    const rejected = assert.rejects(evaluation, SageSessionClosedError);
    await started;
    const worker = session.worker;
    await session.close();
    await rejected;
    assert.equal(worker.threadId, -1);
  } finally {
    await session.close();
  }
});

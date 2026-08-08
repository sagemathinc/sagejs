"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("pickle round-trips basic containers and object state", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "import pickle",
    "value = {'tuple': (1, 2.5), 'list': [True, None], 'bytes': b'abc'}",
    "answer = pickle.loads(pickle.dumps(value))",
    "print(answer == value, isinstance(answer['tuple'], tuple))",
    "print(pickle.HIGHEST_PROTOCOL, pickle.DEFAULT_PROTOCOL)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "True True",
    "5 4",
  ].join("\n"));
});

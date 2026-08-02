"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const serialization = require("../dist/tools/serialization.js");
const { createSage } = require("../dist/tools/kernel.js");

test("serialization v1 preserves graphs, exact integers, and binary blocks", () => {
  const shared = { exact: 2n ** 200n };
  const value = [shared, shared, new Uint8Array([0, 1, 127, 255]), NaN, -0];
  value.push(value);

  const packet = serialization.encode(value);
  assert.equal(packet.schema, serialization.SAGEJS_SERIALIZATION_SCHEMA);
  assert.equal(packet.buffers.length, 1);
  const answer = serialization.decode(packet);
  assert.equal(answer[0], answer[1]);
  assert.equal(answer[0].exact, 2n ** 200n);
  assert.deepEqual([...answer[2]], [0, 1, 127, 255]);
  assert.ok(Number.isNaN(answer[3]));
  assert.ok(Object.is(answer[4], -0));
  assert.equal(answer[5], answer);

  const portable = serialization.dumps(value);
  assert.equal(portable, serialization.dumps(value));
  const stored = serialization.loads(portable);
  assert.equal(stored[0], stored[1]);
  assert.equal(stored[5], stored);
  assert.throws(
    () => serialization.dumps(() => 1),
    /executable code is never part/,
  );
});

test("mathematical values round trip through durable storage", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dumps, loads",
    "R.<x> = QQ[]",
    "f = (x + 1/2)^5",
    "A = matrix(GF(7), 2, [1, 2, 3, 4])",
    "shared = [f, A]",
    "value = {'left': shared, 'right': shared, 'v': vector(QQ, [1, 1/3])}",
    "value['set'] = {1, 2, 3}",
    "value['frozen'] = frozenset([4, 5])",
    "data = dumps(value)",
    "answer = loads(data)",
    "print(answer['left'] is answer['right'])",
    "print(answer['left'][0] == f, answer['left'][0].parent() is R)",
    "print(answer['left'][1] == A, answer['left'][1].base_ring() is GF(7))",
    "print(answer['v'] == value['v'])",
    "print(answer['set'] == value['set'], answer['frozen'] == value['frozen'])",
    "B = random_matrix(GF(7), 100)",
    "encoded = dumps(B)",
    "print(loads(encoded) == B, len(encoded) < 30000)",
    "C = matrix(ZZ, 3, [0, -1, 2^80 + 7, -2^130, 255, -999999])",
    "encoded_integer = dumps(C)",
    "print(loads(encoded_integer) == C, len(encoded_integer) < 2000)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    ["True", "True True", "True True", "True", "True True", "True True", "True True"].join("\n"),
  );
});

test("multiprocessing transports mathematical arguments and results", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from multiprocessing import Pool",
    "def square(A):",
    "    return A*A",
    "values = [matrix(GF(7), 2, [1,2,3,4]), matrix(GF(7), 2, [4,3,2,1])]",
    "with Pool(2) as pool:",
    "    answer = pool.map(square, values)",
    "print(answer == [A*A for A in values])",
    "print(all(A.base_ring() is GF(7) for A in answer))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "True\nTrue");
});

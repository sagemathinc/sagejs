"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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

  const packed = serialization.pack(value);
  assert.deepEqual([...packed.subarray(0, 8)], [83, 65, 71, 69, 80, 75, 49, 0]);
  assert.deepEqual(serialization.unpack(packed)[2], new Uint8Array([0, 1, 127, 255]));
  assert.deepEqual(packed, serialization.pack(value));
  assert.throws(() => serialization.unpack(packed.subarray(0, packed.length - 1)), /truncated/);
  assert.throws(
    () => serialization.unpack(Uint8Array.from([...packed, 0])),
    /trailing data/,
  );

  const golden = serialization.pack([0, 2n ** 80n, "sagepack", new Uint8Array([0, 255])]);
  assert.equal(
    crypto.createHash("sha256").update(golden).digest("hex"),
    "2b59445078b740f189739a7d239b6ac16864e245f1aafb550723408b9a390e02",
  );
});

test("mathematical values round trip through durable storage", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dump, dumps, load, loads, _host_call",
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
    "Q = matrix(QQ, 3, [0, -1/3, (2^100 + 9)/7, -2^130/11, 255/257, -999999/37])",
    "encoded_rational = dumps(Q)",
    "print(loads(encoded_rational) == Q, len(encoded_rational) < 2000)",
    "qv = vector(QQ, [0, -1/3, (2^100 + 9)/7])",
    "print(loads(dumps(qv)) == qv, len(dumps(qv)) < 1000)",
    "legacy_json = _host_call('serializationDumps', Q)",
    "legacy_json = legacy_json.replace('sage.linear_algebra.element', 'sage.element')",
    "legacy_json = legacy_json.replace('sage.linear_algebra.parent', 'sage.parent')",
    "print(loads(legacy_json) == Q)",
    "filename = '/tmp/sagejs-serialization-test.sagepack'",
    "with open(filename, 'wb') as output:",
    "    dump(Q, output)",
    "with open(filename, 'rb') as input_file:",
    "    restored_file = load(input_file)",
    "print(restored_file == Q, open(filename, 'rb').read(8) == b'SAGEPK1\\x00')",
    "import os",
    "os.remove(filename)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "True", "True True", "True True", "True", "True True", "True True",
      "True True", "True True", "True True", "True", "True True",
    ].join("\n"),
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

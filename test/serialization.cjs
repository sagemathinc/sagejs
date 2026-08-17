"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const serialization = require("../dist/tools/serialization.js");
const { createSage } = require("../dist/tools/kernel.js");

test("compact integer tuple tables decode exact bounded JSON", () => {
  const table = serialization.loadsIntegerTupleTable(
    '{"2":{"1":[1,1],"3":[1,0,1,1]}}',
  );
  assert.ok(table instanceof Map);
  assert.deepEqual(table.get(2).get(1), [1, 1]);
  assert.ok(Object.isFrozen(table.get(2).get(1)));
  assert.throws(
    () => serialization.loadsIntegerTupleTable('{"02":{"1":[1]}}'),
    /canonical nonnegative integer/,
  );
  assert.throws(
    () => serialization.loadsIntegerTupleTable('{"2":{"1":[1.5]}}'),
    /not an exact integer/,
  );
  assert.throws(
    () => serialization.loadsIntegerTupleTable('{"2":[]}'),
    /row is not an object/,
  );
});

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

test("exact polynomial compact bytes reject noncanonical values", () => {
  function polynomialBytes(magic, parts, count = 1) {
    return Uint8Array.from([
      ...Buffer.from(magic, "ascii"),
      1, 0, 0, 0,
      count & 0xff, (count >> 8) & 0xff, 0, 0, 0, 0, 0, 0,
      ...parts,
    ]);
  }
  const parent = {
    _from_coefficients(coefficients) {
      return coefficients;
    },
  };
  function decode(bytes, encoding = "fmpz-poly-le-v1") {
    return serialization.sageArithmeticElementCodec.decode(null, {
      decode: () => ({
        kind: "polynomial",
        parent,
        coefficients: bytes,
        coefficientEncoding: encoding,
      }),
    });
  }

  assert.deepEqual(
    decode(polynomialBytes("SJPZ", [1, 0, 0, 128, 1])),
    [-1n],
  );
  assert.deepEqual(decode(polynomialBytes("SJPZ", [], 0)), []);
  assert.deepEqual(
    decode(polynomialBytes("SJPZ", [0, 0, 0, 0, 1, 0, 0, 0, 1], 2)),
    [0n, 1n],
  );
  assert.throws(
    () => decode(polynomialBytes("SJPZ", [2, 0, 0, 0, 1, 0])),
    /magnitude is not canonical/,
  );
  assert.throws(
    () => decode(polynomialBytes("SJPZ", [0, 0, 0, 128])),
    /negative zero/,
  );
  assert.throws(
    () => decode(polynomialBytes("SJPZ", [1, 0, 0, 0])),
    /integer is truncated/,
  );
  assert.throws(
    () => decode(polynomialBytes("SJPZ", [1, 0, 0, 0, 1, 7])),
    /trailing bytes/,
  );
  assert.throws(
    () => decode(
      polynomialBytes("SJPQ", [0, 0, 0, 0, 0, 0, 0, 0]),
      "fmpq-poly-le-v1",
    ),
    /denominator is not positive/,
  );
  assert.throws(
    () => decode(
      polynomialBytes("SJPQ", [1, 0, 0, 0, 2, 1, 0, 0, 0, 4]),
      "fmpq-poly-le-v1",
    ),
    /rational coefficient is not reduced/,
  );
  assert.throws(
    () => decode(
      polynomialBytes("SJPQ", [0, 0, 0, 0, 1, 0, 0, 0, 2]),
      "fmpq-poly-le-v1",
    ),
    /rational coefficient is not reduced/,
  );
  assert.throws(
    () => decode(polynomialBytes("SJPZ", [0, 0, 0, 0])),
    /leading coefficient is zero/,
  );
  assert.throws(
    () => decode(
      polynomialBytes("SJPQ", [0, 0, 0, 0, 1, 0, 0, 0, 1]),
      "fmpq-poly-le-v1",
    ),
    /leading coefficient is zero/,
  );

  const previousQQ = globalThis.QQ;
  globalThis.QQ = (numerator, denominator) => ({ numerator, denominator });
  try {
    assert.deepEqual(
      decode(
        polynomialBytes(
          "SJPQ",
          [
            0, 0, 0, 0,
            1, 0, 0, 0, 1,
            1, 0, 0, 128, 2,
            1, 0, 0, 0, 3,
          ],
          2,
        ),
        "fmpq-poly-le-v1",
      ),
      [
        { numerator: 0n, denominator: 1n },
        { numerator: -2n, denominator: 3n },
      ],
    );
    assert.deepEqual(
      decode(polynomialBytes("SJPQ", [], 0), "fmpq-poly-le-v1"),
      [],
    );
  } finally {
    if (previousQQ === undefined) delete globalThis.QQ;
    else globalThis.QQ = previousQQ;
  }
});

test("small-prime polynomial codec uses canonical packed residues", () => {
  const base = { _kind: "GF", _order: 257n };
  const parent = {
    _construction: {
      kind: "polynomial",
      base,
      variable: "z",
      sparse: false,
    },
    base_ring() {
      return base;
    },
    _from_coefficients(coefficients) {
      return coefficients;
    },
  };
  const value = {
    _parent: parent,
    _storage: new BigUint64Array([0n, 1n, 256n, 0n, 0n]),
    coefficients() {
      throw new Error("packed polynomial serialization materialized coefficients");
    },
  };
  let transferred;
  const payload = serialization.sageArithmeticElementCodec.encode(value, {
    encode: (item) => item,
    buffer: () => {
      throw new Error("nested packet encoding is not used by this codec test");
    },
    transferable: (bytes) => {
      transferred = bytes;
      return bytes;
    },
  });
  assert.equal(payload.coefficientEncoding, "prime-field-poly-le-v1");
  assert.equal(payload.coefficientWidth, 2);
  assert.equal(payload.coefficientCount, 3);
  assert.equal(payload.coefficients, transferred);
  assert.deepEqual([...payload.coefficients], [0, 0, 1, 0, 0, 1]);
  assert.equal(
    crypto.createHash("sha256").update(serialization.pack(value)).digest("hex"),
    "103d69f7a17511743796ddae7bd0f37080efc09c9c7ecb3d1a6637d06a289d38",
    "packed prime-field polynomials are byte-for-byte deterministic",
  );

  const decode = (changes = {}) => serialization.sageArithmeticElementCodec.decode(
    null,
    {
      decode: () => ({ ...payload, parent, ...changes }),
    },
  );
  assert.deepEqual(decode(), [0, 1, 256]);
  assert.deepEqual(
    decode({ coefficients: new Uint8Array(), coefficientCount: 0 }),
    [],
  );
  assert.deepEqual(
    serialization.sageArithmeticElementCodec.decode(null, {
      decode: () => ({ kind: "polynomial", parent, coefficients: [7, 11] }),
    }),
    [7, 11],
    "already-produced generic coefficient payloads remain readable",
  );
  assert.throws(
    () => decode({ coefficientWidth: 4 }),
    /residue width is noncanonical/,
  );
  assert.throws(
    () => decode({ coefficientCount: -1 }),
    /length is invalid/,
  );
  assert.throws(
    () => decode({ coefficientCount: "3" }),
    /length is invalid/,
  );
  assert.throws(
    () => decode({ coefficientWidth: "2" }),
    /residue width is invalid/,
  );
  assert.throws(
    () => decode({ coefficientCount: 2 }),
    /coefficient buffer is invalid/,
  );
  assert.throws(
    () => decode({ coefficients: new Uint8Array([1, 1]), coefficientCount: 1 }),
    /residue is outside its field/,
  );
  assert.throws(
    () => decode({ coefficients: new Uint8Array([0, 0]), coefficientCount: 1 }),
    /trailing zero coefficient/,
  );
});

test("word-prime polynomial codec uses canonical uint64 residues", () => {
  const modulus = 18446744073709551557n;
  const base = { _kind: "GF", _order: modulus };
  const parent = {
    _construction: { kind: "polynomial", base, variable: "w", sparse: false },
    base_ring() {
      return base;
    },
    _from_coefficients(coefficients) {
      return coefficients;
    },
  };
  const sample = 0x0102_0304_0506_0708n;
  const value = {
    _parent: parent,
    _storage: BigUint64Array.from([
      0n,
      1n,
      sample,
      modulus - 1n,
      0n,
      0n,
    ]),
    coefficients() {
      throw new Error("fixed-width serialization materialized coefficients");
    },
  };
  let transferred;
  const payload = serialization.sageArithmeticElementCodec.encode(value, {
    encode: (item) => item,
    buffer: () => {
      throw new Error("nested packet encoding is not used by this codec test");
    },
    transferable: (bytes) => {
      transferred = bytes;
      return bytes;
    },
  });
  assert.equal(payload.coefficientEncoding, "prime-field-poly-le-v1");
  assert.equal(payload.coefficientWidth, 8);
  assert.equal(payload.coefficientCount, 4);
  assert.equal(payload.coefficients, transferred);
  assert.deepEqual([...payload.coefficients], [
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 0, 0, 0, 0,
    8, 7, 6, 5, 4, 3, 2, 1,
    196, 255, 255, 255, 255, 255, 255, 255,
  ]);

  const decode = (changes = {}) => serialization.sageArithmeticElementCodec.decode(
    null,
    { decode: () => ({ ...payload, parent, ...changes }) },
  );
  assert.deepEqual(decode(), [0n, 1n, sample, modulus - 1n]);
  assert.throws(
    () => decode({ coefficientWidth: 4 }),
    /residue width is noncanonical/,
  );
  assert.throws(
    () => decode({ coefficientCount: 3 }),
    /coefficient buffer is invalid/,
  );
  const outside = payload.coefficients.slice();
  new DataView(outside.buffer).setBigUint64(24, modulus, true);
  assert.throws(
    () => decode({ coefficients: outside }),
    /residue is outside its field/,
  );
  const trailingZero = new Uint8Array(payload.coefficients.length + 8);
  trailingZero.set(payload.coefficients);
  assert.throws(
    () => decode({ coefficients: trailingZero, coefficientCount: 5 }),
    /trailing zero coefficient/,
  );
});

test("large small-prime polynomials have compact linear SagePack payloads", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dumps, loads",
    "from time import time",
    "R.<sagepack_variable> = GF(65521)[]",
    "f = R([(index*37 + 11) % 65521 for index in range(20000)])",
    "started = time()",
    "data = dumps(f)",
    "dump_ms = (time() - started) * 1000",
    "started = time()",
    "answer = loads(data)",
    "load_ms = (time() - started) * 1000",
    "print(len(data) < 60000, dump_ms < 500, load_ms < 500)",
    "print(answer == f, answer.parent() is R, R.variable_name())",
    "print(dumps(R(0)) == dumps(loads(dumps(R(0)))))",
    "print(dumps(R([1, 2, 0, 0])) == dumps(R([1, 2])))",
    "print(len(data), dump_ms, load_ms)",
  ].join("\n"));
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines[0], "True True True");
  assert.equal(lines[1], "True True sagepack_variable");
  assert.equal(lines[2], "True");
  assert.equal(lines[3], "True");
  const [length, dumpMs, loadMs] = lines[4].split(" ").map(Number);
  assert.ok(length < 60000, `compact GF(p)[x] payload used ${length} bytes`);
  assert.ok(dumpMs < 500, `compact GF(p)[x] dump took ${dumpMs} ms`);
  assert.ok(loadMs < 500, `compact GF(p)[x] load took ${loadMs} ms`);
});

test("large word-prime polynomials have compact linear SagePack payloads", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dumps, loads",
    "from time import time",
    "p = 2305843009213693951",
    "R.<word_sagepack_variable> = GF(p)[]",
    "f = R([(index*1000000007 + index*index*97 + 11) % p for index in range(20000)])",
    "started = time()",
    "data = dumps(f)",
    "dump_ms = (time() - started) * 1000",
    "started = time()",
    "answer = loads(data)",
    "load_ms = (time() - started) * 1000",
    "print(len(data) < 180000, dump_ms < 500, load_ms < 500)",
    "print(answer == f, answer.parent() is R, R.variable_name())",
    "print(len(data), dump_ms, load_ms)",
  ].join("\n"));
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines[0], "True True True");
  assert.equal(lines[1], "True True word_sagepack_variable");
  const [length, dumpMs, loadMs] = lines[2].split(" ").map(Number);
  assert.ok(length < 180000, `compact word-prime payload used ${length} bytes`);
  assert.ok(dumpMs < 500, `compact word-prime dump took ${dumpMs} ms`);
  assert.ok(loadMs < 500, `compact word-prime load took ${loadMs} ms`);
});

test("worker packets move codec-owned buffers but copy caller-owned bytes", () => {
  class OwnedPayload {
    constructor(bytes) {
      this.bytes = bytes;
    }
  }
  const unregister = serialization.registerCodec({
    type: "test.owned-buffer",
    version: 1,
    test: (value) => value instanceof OwnedPayload,
    encode: (value, context) => context.encode({
      bytes: context.transferable(value.bytes),
    }),
    decode: (payload, context) => {
      const data = context.decode(payload);
      return new OwnedPayload(data.bytes);
    },
  });
  try {
    const ownedBytes = new Uint8Array([1, 2, 3, 4]);
    const transferable = serialization.encodeForTransfer(
      new OwnedPayload(ownedBytes),
    );
    assert.equal(transferable.buffers[0], ownedBytes.buffer);

    const durable = serialization.encode(new OwnedPayload(ownedBytes));
    assert.notEqual(durable.buffers[0], ownedBytes.buffer);
    assert.deepEqual([...serialization.decode(durable).bytes], [1, 2, 3, 4]);

    const callerOwned = new Uint8Array([5, 6, 7]);
    const copied = serialization.encodeForTransfer(callerOwned);
    assert.notEqual(copied.buffers[0], callerOwned.buffer);
  } finally {
    unregister();
  }
});

test("dense matrix codecs stay on native packed-buffer paths", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dumps, loads",
    "from time import time",
    "matrices = [",
    "    matrix(GF(7), 128, 128, lambda i,j: (17*i + 31*j) % 7),",
    "    matrix(ZZ, 128, 128, lambda i,j: (i-j)^3),",
    "    matrix(QQ, 128, 128, lambda i,j: (i-j)/(i+j+1)),",
    "]",
    "limits = [20000, 130000, 200000]",
    "start = time()",
    "for A, limit in zip(matrices, limits):",
    "    A.list = lambda: 1/0",
    "    encoded = dumps(A)",
    "    print(len(encoded) < limit, loads(encoded) == A)",
    "print(time() - start < 5)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "True True\nTrue True\nTrue True\nTrue",
  );
});

test("mathematical values round trip through durable storage", async (t) => {
  const filename = path.join(
    os.tmpdir(),
    `sagejs-serialization-test-${process.pid}.sagepack`,
  );
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
    `filename = ${JSON.stringify(filename)}`,
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

test("global save/load and dumps/loads use SagePack files", async (t) => {
  const base = path.join(
    os.tmpdir(),
    `sagejs-global-save-test-${process.pid}`,
  );
  const other = path.join(
    os.tmpdir(),
    `sagejs-global-save-other-${process.pid}.sobj`,
  );
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "import os",
    "from pathlib import Path",
    "A = matrix(ZZ, 2, [1, -2, 3, 2^100])",
    "payload = dumps(A)",
    "print(payload[:8] == b'SAGEPK1\\x00', loads(payload) == A)",
    `base = ${JSON.stringify(base)}`,
    "print(save(A, base) is None)",
    "print(os.path.exists(base + '.sobj'), load(base) == A)",
    `other = Path(${JSON.stringify(other)})`,
    "save(A + A, other)",
    "answer = load(base, other)",
    "print(answer == [A, A + A])",
    "print(open(base + '.sobj', 'rb').read(8) == b'SAGEPK1\\x00')",
    "os.remove(base + '.sobj')",
    "os.remove(other)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "True True\nTrue\nTrue True\nTrue\nTrue",
  );
});

test("multiprocessing transports mathematical arguments and results", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from multiprocessing import Pool",
    "def square(A):",
    "    return A*A",
    "def double_point(P):",
    "    return P + P",
    "def square_algebraic(a):",
    "    return a*a",
    "values = [matrix(GF(7), 2, [1,2,3,4]), matrix(GF(7), 2, [4,3,2,1])]",
    "with Pool(2) as pool:",
    "    answer = pool.map(square, values)",
    "print(answer == [A*A for A in values])",
    "print(all(A.base_ring() is GF(7) for A in answer))",
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^3 - x + 1)",
    "E = EllipticCurve([0, 0, 1, -1, 0])",
    "P = E([0, 0])",
    "with Pool(2) as pool:",
    "    algebraic = pool.map(square_algebraic, [a + 1/3])[0]",
    "    point = pool.map(double_point, [P])[0]",
    "print(algebraic._coefficients == ((a + 1/3)^2)._coefficients)",
    "print(list(point) == list(P + P))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "True\nTrue\nTrue\nTrue");
});

test("polynomial, ideal, quotient, and extension-field data round trip", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from multiprocessing import Pool",
    "from sagejs_serialization import dumps, loads",
    "K.<a> = GF(9)",
    "alpha = a^2 + 2*a + 1",
    "V = PolynomialRing(GF(3), 'v')",
    "v = V.gen()",
    "L = GF(9, 'u', modulus=v^2 + 1)",
    "beta = L.gen() + 1",
    "custom_matrix = matrix(L, [[L.gen(), 1], [1, 0]])",
    "U.<t> = K[]",
    "f = (a + 1)*t^3 + 2*a*t + 1",
    "R.<x,y> = PolynomialRing(QQ, order='lex')",
    "g = -1/2*x^3*y + 7*x*y^2 - y + 3/5",
    "I = R.ideal(x^2 - y, x*y - 1)",
    "B = I.groebner_basis()",
    "S.<z> = QQ[]",
    "N = NumberField(z^2 + z + 1, 'b')",
    "Q = N.polynomial_quotient_ring()",
    "answer = loads(dumps([alpha, f, g, I, B, Q, beta, custom_matrix]))",
    "print(answer[0] == alpha, answer[0].parent() is K)",
    "print(answer[1] == f, answer[1].parent() is U)",
    "print(answer[2] == g, answer[2].parent() is R)",
    "print(list(answer[3].gens()) == list(I.gens()), answer[3].ring() is R)",
    "print(list(answer[4]) == list(B), answer[4].universe() is R)",
    "print(repr(answer[5]) == repr(Q))",
    "print(answer[6] == beta, answer[6].parent() is L, repr(answer[6].parent().modulus()))",
    "print(answer[7] == custom_matrix, answer[7].base_ring() is L)",
    "def return_serialized_polynomial_value(value):",
    "    return value",
    "moved = []",
    "for value in [alpha, g, I, B, beta, custom_matrix]:",
    "    with Pool(1) as pool:",
    "        moved.append(pool.apply(return_serialized_polynomial_value, (value,)))",
    "print(moved[0] == alpha, moved[0].parent() is K)",
    "print(moved[1] == g, moved[1].parent() is R)",
    "print(list(moved[2].gens()) == list(I.gens()), moved[2].ring() is R)",
    "print(list(moved[3]) == list(B), moved[3].universe() is R)",
    "print(moved[4] == beta, moved[4].parent() is L)",
    "print(moved[5] == custom_matrix, moved[5].base_ring() is L)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "True True", "True True", "True True", "True True", "True True",
      "True", "True True x^2 + 1", "True True",
      "True True", "True True", "True True", "True True",
      "True True", "True True",
    ].join("\n"),
  );
});

test("research number-theory objects retain exact parents and subspaces", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dumps, loads",
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^3 - x + 1)",
    "alpha = (a^2 + 1/3) / (a - 2)",
    "C = CyclotomicField(12)",
    "zeta = C.gen() + C(1/3)",
    "QF.<i> = QuadraticField(-1)",
    "gaussian = QF(7, -11)",
    "E = EllipticCurve([0, 0, 1, -1, 0])",
    "P = E([0, 0])",
    "O = E(0)",
    "G = DirichletGroup(37)",
    "chi = G.gen()",
    "M = ModularSymbols(389, 2, sign=1)",
    "decomposition = M.decomposition()",
    "factor_space = decomposition[3]",
    "symbol = factor_space.gen(0)",
    "hecke = factor_space.T(2)",
    "hecke_matrix = hecke.matrix()",
    "star = factor_space.star_involution()",
    "CM = ModularSymbols(chi, 5)",
    "ideal = QF.primes_of_bounded_norm(20)[0]",
    "MF = ModularForms(11, 4, prec=20)",
    "EF = MF.eisenstein_subspace()",
    "eisenstein = EF.gen(0)",
    "qexp = eisenstein.q_expansion(30)",
    "L.<t> = LaurentSeriesRing(QQ, default_prec=17)",
    "laurent = (t^-2 + 3 + 5*t).add_bigoh(11)",
    "value = {'K': K, 'alpha': alpha, 'C': C, 'zeta': zeta, 'QF': QF, 'gaussian': gaussian, 'ideal': ideal, 'E': E, 'P': P, 'O': O, 'G': G, 'chi': chi, 'space': factor_space, 'symbol': symbol, 'hecke': hecke, 'star': star, 'decomposition': decomposition, 'character_space': CM, 'MF': MF, 'EF': EF, 'eisenstein': eisenstein, 'qexp': qexp, 'L': L, 'laurent': laurent}",
    "answer = loads(dumps(value))",
    "print(answer['alpha']._coefficients == alpha._coefficients, answer['alpha'].parent() is answer['K'])",
    "print(answer['zeta'] == zeta, answer['zeta'].parent() is answer['C'])",
    "print(list(answer['gaussian']) == list(gaussian), answer['gaussian'].parent() is answer['QF'])",
    "print(answer['P'] == answer['E']([0,0]), answer['O'].is_zero())",
    "print(answer['P'].parent() is answer['E'], answer['E'].ainvs() == E.ainvs())",
    "print(answer['chi'] == chi, answer['chi']._parent is DirichletGroup(37))",
    "print(answer['space'].basis_matrix() == factor_space.basis_matrix())",
    "print(answer['symbol'].parent() is answer['space'], answer['symbol'].vector() == symbol.vector())",
    "print(answer['character_space'].dimension() == CM.dimension(), answer['character_space'].character() == chi)",
    "print(list(answer['ideal'].gens_reduced()[0]) == list(ideal.gens_reduced()[0]), answer['ideal']._parent is answer['QF'])",
    "print(answer['hecke'].matrix() == hecke_matrix, answer['hecke']._space is answer['space'])",
    "print(answer['star'].matrix() == star.matrix(), answer['star']._space is answer['space'])",
    "print(answer['decomposition'][3] is answer['space'], len(answer['decomposition']) == len(decomposition))",
    "print(answer['EF'].ambient_space() is answer['MF'], answer['EF'].dimension() == EF.dimension())",
    "print(answer['eisenstein'].parent() is answer['EF'], answer['eisenstein'].q_expansion(30) == qexp)",
    "print(answer['qexp'].padded_list() == qexp.padded_list(), answer['qexp'].precision_absolute() == 30)",
    "print(answer['laurent'].padded_list(12) == laurent.padded_list(12), answer['laurent'].parent() is answer['L'])",
    "signed = ModularSymbols(1000, 2, sign=1)",
    "signed_data = dumps(signed)",
    "signed_answer = loads(signed_data)",
    "print(len(signed_data) < 2048, signed_answer.dimension() == signed.dimension(), signed_answer.sign() == 1)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "True True", "True True", "True True", "True True", "True True",
      "True True", "True", "True True", "True True", "True True",
      "True True", "True True", "True True",
      "True True", "True True", "True True", "True True",
      "True True True",
    ].join("\n"),
  );
});

test("research SagePack golden vectors are byte-for-byte deterministic", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-golden-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const series = path.join(directory, "series");
  const modularForms = path.join(directory, "modforms");
  const modularSymbols = path.join(directory, "modsym");
  const result = await session.evaluate([
    "R.<q> = PowerSeriesRing(QQ, default_prec=13)",
    "series = (1 + 2*q + 5*q^4).add_bigoh(13)",
    `save(series, ${JSON.stringify(series)})`,
    "MF = ModularForms(11, 4, prec=12)",
    "EF = MF.eisenstein_subspace()",
    "e = EF.gen(0)",
    "qexp = e.q_expansion(12)",
    `save([MF, EF, e, qexp], ${JSON.stringify(modularForms)})`,
    "M = ModularSymbols(37, 2, sign=1)",
    "D = M.decomposition()",
    "packet = [(A, A.T(2)) for A in D]",
    `save([M, D, packet], ${JSON.stringify(modularSymbols)})`,
  ].join("\n"));
  assert.equal(result.stderr || "", "");

  const digest = (filename) => crypto
    .createHash("sha256")
    .update(fs.readFileSync(`${filename}.sobj`))
    .digest("hex");
  assert.equal(
    digest(series),
    "4a1fba24db809f5d147f3e663ef986b74494df899a29830210169a2f8a0484fd",
  );
  assert.equal(
    digest(modularForms),
    "f6e8c03f908473570e7f3665c6fab00d1da62da224865e2bc4ee9e675a0ddbb2",
  );
  assert.equal(
    digest(modularSymbols),
    "b2e892adf9b5d4d0cbc8d7294ca9eb6c4cb29a53426348950bc7dad390c878e9",
  );
});

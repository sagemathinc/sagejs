"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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

test("global save/load and dumps/loads use SagePack files", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "import os",
    "from pathlib import Path",
    "A = matrix(ZZ, 2, [1, -2, 3, 2^100])",
    "payload = dumps(A)",
    "print(payload[:8] == b'SAGEPK1\\x00', loads(payload) == A)",
    "base = '/tmp/sagejs-global-save-test'",
    "print(save(A, base) is None)",
    "print(os.path.exists(base + '.sobj'), load(base) == A)",
    "other = Path('/tmp/sagejs-global-save-other.sobj')",
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
    "U.<t> = K[]",
    "f = (a + 1)*t^3 + 2*a*t + 1",
    "R.<x,y> = PolynomialRing(QQ, order='lex')",
    "g = -1/2*x^3*y + 7*x*y^2 - y + 3/5",
    "I = R.ideal(x^2 - y, x*y - 1)",
    "B = I.groebner_basis()",
    "S.<z> = QQ[]",
    "N = NumberField(z^2 + z + 1, 'b')",
    "Q = N.polynomial_quotient_ring()",
    "answer = loads(dumps([alpha, f, g, I, B, Q]))",
    "print(answer[0] == alpha, answer[0].parent() is K)",
    "print(answer[1] == f, answer[1].parent() is U)",
    "print(answer[2] == g, answer[2].parent() is R)",
    "print(list(answer[3].gens()) == list(I.gens()), answer[3].ring() is R)",
    "print(list(answer[4]) == list(B), answer[4].universe() is R)",
    "print(repr(answer[5]) == repr(Q))",
    "def return_serialized_polynomial_value(value):",
    "    return value",
    "moved = []",
    "for value in [alpha, g, I, B]:",
    "    with Pool(1) as pool:",
    "        moved.append(pool.apply(return_serialized_polynomial_value, (value,)))",
    "print(moved[0] == alpha, moved[0].parent() is K)",
    "print(moved[1] == g, moved[1].parent() is R)",
    "print(list(moved[2].gens()) == list(I.gens()), moved[2].ring() is R)",
    "print(list(moved[3]) == list(B), moved[3].universe() is R)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "True True", "True True", "True True", "True True", "True True",
      "True", "True True", "True True", "True True", "True True",
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

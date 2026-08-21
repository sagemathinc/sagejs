"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("native Arb values and jets agree with the readable genus-2 evaluator", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x^3-x+1)",
        "L = C.lseries()",
        "native = L.value(1, prec=32, algorithm='native')",
        "native_diag = L.last_diagnostics()",
        "ball = L.value_ball(1, prec=32)",
        "jet = L.central_jet(2, completed=True, prec=32, algorithm='native')",
        "reference = L.value(1, prec=32, algorithm='reference')",
        "(abs(native-reference) < 1e-8, abs(native-0.2858010009469617) < 1e-8,",
        " native_diag['algorithm'], native_diag['refinement_stable'],",
        " ball['arithmetic_balls_rigorous'], ball['rigorous'],",
        " abs(jet[1]) < 1e-20, len(jet))",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "(True, True, 'native-arb-central-mellin-weights', True, True, False, True, 3)",
    );
  } finally {
    await session.close();
  }
});

test("200-bit central jets agree with the independent inverse-Mellin route", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x^3-x+1)",
        "L = C.lseries()",
        "central = L.central_jet(4, completed=True, prec=200, algorithm='native')",
        "central_diag = dict(L.last_diagnostics())",
        "inverse = L.central_jet(4, completed=True, prec=200, algorithm='inverse_mellin')",
        "inverse_diag = dict(L.last_diagnostics())",
        "(all(abs(central[k]-inverse[k]) < 2**-150 for k in range(5)),",
        " central_diag['refinement_stable'], inverse_diag['refinement_stable'],",
        " central_diag['algorithm'], inverse_diag['algorithm'])",
      ].join("\n"),
      { timeout: 300_000 },
    );
    assert.equal(
      result.repr,
      "(True, True, True, 'native-arb-central-mellin-weights', " +
        "'native-arb-double-mellin')",
    );
  } finally {
    await session.close();
  }
});

test("prepared central weights cache jets and batch general values", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.lseries import central_weight, clear_central_weight_cache, central_weight_cache_info",
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x^3-x+1)",
        "L = C.lseries()",
        "I = L.init(prec=32, max_order=4, domain=(0,2,-2,2))",
        "jet = I.central_jet(4, completed=True)",
        "line = I.values_along_line(1, 2, 3)",
        "weight = central_weight(2, 0, 1, prec=32)",
        "info = central_weight_cache_info()",
        "(abs(I.central_value()-L.value(1,prec=32)) < 1e-8,",
        " abs(jet[1]) < 1e-20, abs(jet[3]) < 1e-20,",
        " len(line), abs(line[0]-I.central_value()) < 1e-8,",
        " abs(float(weight)-0.27973176363304485) < 1e-10,",
        " info['reference_weights'] >= 1, I.diagnostics()['cached_points'])",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "(True, True, True, 3, True, True, True, 3)");
  } finally {
    await session.close();
  }
});

test("optional WebGPU capability fails closed without changing CPU results", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.gpu_twists import gpu_twist_capabilities",
        "capability = gpu_twist_capabilities()",
        "(capability['backend'], capability['numeric_format'],",
        " capability['authoritative'], capability['candidate_screen_only'],",
        " isinstance(capability['available'], bool))",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "('webgpu', 'f32', False, True, True)");
  } finally {
    await session.close();
  }
});

test("fundamental discriminants, twist models, and checkpoint resume are exact", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-twists-"));
  const output = join(directory, "family.jsonl");
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.twists import fundamental_discriminants, _quadratic_character",
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x^3-x+1)",
        "twist = C.quadratic_twist(1)",
        "state = {'calls': 0}",
        "def cancel():",
        "    state['calls'] += 1",
        "    return state['calls'] > 1",
        `first = C.quadratic_twists(1, 5, prec=16, algorithm='native', cancel=cancel).export_jsonl(${JSON.stringify(output)}, flush=True)`,
        `second = C.quadratic_twists(1, 5, prec=16, algorithm='native').export_jsonl(${JSON.stringify(output)}, resume=True, flush=True)`,
        "overlap = list(C.quadratic_twists(-23,-23,prec=16))[0]",
        "characters = all(_quadratic_character(d,n) == kronecker(d,n)",
        "                 for d in fundamental_discriminants(-20,20)",
        "                 for n in range(-30,31) if gcd(abs(d),abs(n)) == 1)",
        "(list(fundamental_discriminants(-20,20)), characters,",
        " twist.genus(), first['status'], first['records_total'],",
        " second['status'], second['records_total'], second['next_discriminant'],",
        " overlap.status, 'gcd(D,N)=1' in overlap.reason)",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "([-20, -19, -15, -11, -8, -7, -4, -3, 1, 5, 8, 12, 13, 17], " +
        "True, 2, 'cancelled', 1, 'complete', 2, None, 'unsupported', True)",
    );
    const lines = readFileSync(output, "utf8").trimEnd().split("\n");
    assert.equal(lines.length, 3);
    const header = JSON.parse(lines[0]);
    const rows = lines.slice(1).map(JSON.parse);
    assert.equal(header.schema, "sagejs.hyperelliptic-quadratic-twists/v3");
    assert.equal(header.twist_assembly.scope, "gcd(D,N)=1");
    assert.deepEqual(
      rows.map((row) => row.discriminant),
      ["1", "5"],
    );
    assert.equal(rows[0].status, "ok");
    assert.equal(rows[0].sequence, 0);
    assert.match(rows[0].sha256, /^[0-9a-f]{64}$/);
    assert.equal(rows[1].previous_sha256, rows[0].sha256);
    assert.equal(rows[1].status, "ok");
    assert.equal(rows[1].conductor, "445625");
    assert.equal(rows[1].root_number, "-1");
    assert.equal(rows[1].algorithm, "functional-equation-parity");
    assert.deepEqual(rows[1].central_derivatives, [
      { real: "0.0000", imaginary: "0.0000" },
    ]);
  } finally {
    await session.close();
  }
});

test("persistent multicore twist tiles agree exactly with sequential CPU rows", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-twist-cpu-cache-"));
  const checkpoint = join(directory, "parallel.jsonl");
  const cancelledCheckpoint = join(directory, "cancelled.jsonl");
  const cache = join(directory, "coefficients");
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x^3-x+1)",
        `cache = ${JSON.stringify(cache)}`,
        "sequential_family = C.quadratic_twists(-11,13,prec=16,max_order=0,algorithm='native',workers=1,cache_dir=cache)",
        "sequential = list(sequential_family)",
        "parallel_family = C.quadratic_twists(-11,13,prec=16,max_order=0,algorithm='native',workers=2,tile_size=2,cache_dir=cache)",
        "parallel = list(parallel_family)",
        "def signature(rows):",
        "    return [(int(r.discriminant),r.status,None if r.conductor is None else int(r.conductor),None if r.root_number is None else int(r.root_number),tuple((str(v.real()),str(v.imag())) for v in r.central_derivatives)) for r in rows]",
        `receipt = C.quadratic_twists(-11,13,prec=16,max_order=0,algorithm='native',workers=2,tile_size=2,cache_dir=cache).export_jsonl(${JSON.stringify(checkpoint)})`,
        `resumed = C.quadratic_twists(-11,13,prec=16,max_order=0,algorithm='native',workers=1,cache_dir=cache).export_jsonl(${JSON.stringify(checkpoint)},resume=True)`,
        "state = {'calls':0}",
        "def cancel_parallel():",
        "    state['calls'] += 1",
        "    return state['calls'] > 3",
        `cancelled = C.quadratic_twists(-11,13,prec=16,max_order=0,algorithm='native',workers=2,tile_size=2,cache_dir=cache,cancel=cancel_parallel).export_jsonl(${JSON.stringify(cancelledCheckpoint)})`,
        `continued = C.quadratic_twists(-11,13,prec=16,max_order=0,algorithm='native',workers=1,cache_dir=cache).export_jsonl(${JSON.stringify(cancelledCheckpoint)},resume=True)`,
        "info = parallel_family.diagnostics()",
        "(signature(sequential) == signature(parallel), len(parallel),",
        " info['engine'], info['workers'], info['cache']['hits'] >= 1,",
        " info['cache']['entries'] >= 1, receipt['status'],",
        " resumed['records_written'], resumed['records_total'],",
        " cancelled['status'], cancelled['records_total'],",
        " continued['status'], continued['records_total'],",
        " len(receipt['checkpoint_sha256']))",
      ].join("\n"),
      { timeout: 300_000 },
    );
    assert.equal(
      result.repr,
      "(True, 10, 'persistent-multicore-v1', 2, True, True, 'complete', 0, 10, " +
        "'cancelled', 2, 'complete', 10, 64)",
    );
    const lines = readFileSync(checkpoint, "utf8").trimEnd().split("\n");
    assert.equal(lines.length, 11);
    for (let index = 1; index < lines.length; index += 1) {
      const row = JSON.parse(lines[index]);
      assert.equal(row.sequence, index - 1);
      assert.match(row.sha256, /^[0-9a-f]{64}$/);
    }
    const original = readFileSync(checkpoint, "utf8");
    writeFileSync(
      checkpoint,
      original.replace('"status":"ok"', '"status":"tampered"'),
    );
    const corrupted = await session.evaluate(
      [
        "message = None",
        "try:",
        `    C.quadratic_twists(-11,13,prec=16,max_order=0,algorithm='native',workers=1,cache_dir=cache).export_jsonl(${JSON.stringify(checkpoint)},resume=True)`,
        "except Exception as error:",
        "    message = str(error)",
        "message",
      ].join("\n"),
    );
    assert.equal(corrupted.repr, "'the twist checkpoint hash chain is invalid'");
  } finally {
    await session.close();
  }
});

test("persistent coefficient cache rejects corrupted content", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-twist-cache-integrity-"));
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.family_cpu import PersistentCoefficientCache, coefficient_cache_identity",
        `root = ${JSON.stringify(directory)}`,
        "identity = coefficient_cache_identity({'curve':'test'}, {'reduction':'test'})",
        "cache = PersistentCoefficientCache(root, identity, max_entries=2)",
        "digest, path = cache.store([0,1,2,3], {'oracle':1})",
        "with open(path, 'r', encoding='utf-8') as source:",
        "    text = source.read()",
        "with open(path, 'w', encoding='utf-8') as output:",
        "    output.write(text.replace('[0,1,2,3]', '[0,1,2,4]'))",
        "loaded = cache.load(3)",
        "cache.store([0,1,2], {'oracle':1})",
        "cache.store([0,1,2,3], {'oracle':1})",
        "cache.store([0,1,2,3,4], {'oracle':1})",
        "info = cache.info()",
        "(loaded is None, info['corruptions'], info['misses'], len(digest), info['entries'], info['largest_cutoff'])",
      ].join("\n"),
    );
    assert.equal(result.repr, "(True, 1, 1, 64, 2, 4)");
  } finally {
    await session.close();
  }
});

test("coprime twist conductor, sign, and central value agree with PARI", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x^3-x+1)",
        "row = list(C.quadratic_twists(-11,-11,prec=24,max_order=0,algorithm='native'))[0]",
        "(row.status, row.conductor, row.root_number,",
        " abs(row.central_value-3.014154944070141073) < 1e-6)",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "('ok', 10439033, 1, True)");
  } finally {
    await session.close();
  }
});

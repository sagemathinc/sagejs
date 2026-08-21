"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync } = require("node:fs");
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
    assert.equal(header.schema, "sagejs.hyperelliptic-quadratic-twists/v2");
    assert.equal(header.twist_assembly.scope, "gcd(D,N)=1");
    assert.deepEqual(
      rows.map((row) => row.discriminant),
      ["1", "5"],
    );
    assert.equal(rows[0].status, "ok");
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

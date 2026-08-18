"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("rforest exposes checked modular genus-3 rows, not guessed factors", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^7+x+1)",
            "from sagejs.hyperelliptic_curves.rforest import (",
            "    rforest_capabilities, rforest_hasse_witt_rows,",
            "    complete_rforest_genus3_rows)",
            "cap = rforest_capabilities()",
            "batch = rforest_hasse_witt_rows(C, 2, 19)",
            "unfinished = complete_rforest_genus3_rows(C, 5, 5)[0]",
            "[(cap is not None, cap.normalization), batch['normalization'],",
            " [(r['prime'], r['status'], r['residues']) for r in batch['rows']],",
            " (unfinished['completion']['status'],",
            "  unfinished['completion']['remaining_candidate_count'],",
            "  unfinished['completion']['lpolynomial'])]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[(True, 'det(I-T*W) mod p'), 'det(I-T*W) mod p', " +
        "[(2, 'unsupported_characteristic', None), " +
        "(3, 'direct', (0, 0, 0)), (5, 'forest', (3, 4, 2)), " +
        "(7, 'forest', (0, 0, 0)), (11, 'singular_model', None), " +
        "(13, 'forest', (7, 3, 8)), (17, 'forest', (3, 12, 10)), " +
        "(19, 'forest', (3, 6, 18))], ('indeterminate', 28, None)]",
    );
  } finally {
    await session.close();
  }
});

test("Jacobian and twist orders certify exact genus-3 completion", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^7+x+1)",
            "from sagejs.hyperelliptic_curves.rforest import complete_rforest_genus3_rows",
            "orders = {5:275, 7:512, 13:4140, 17:6350, 19:8483}",
            "twists = {5:85, 7:512, 13:1432, 17:4522, 19:6237}",
            "rows = complete_rforest_genus3_rows(",
            "    C, 5, 19, jacobian_orders=orders, twist_orders=twists)",
            "[(r['prime'], r.get('completion', {}).get('status'),",
            "  r.get('completion', {}).get('lpolynomial'))",
            " for r in rows]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[(5, 'unique', (1, 3, 9, 17, 45, 75, 125)), " +
        "(7, 'unique', (1, 0, 21, 0, 147, 0, 343)), " +
        "(11, None, None), " +
        "(13, 'unique', (1, 7, 42, 164, 546, 1183, 2197)), " +
        "(17, 'unique', (1, 3, 29, 44, 493, 867, 4913)), " +
        "(19, 'unique', (1, 3, 25, 37, 475, 1083, 6859))]",
    );
  } finally {
    await session.close();
  }
});

test("generalized integral models use the completed-square normalization", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "h = x^3+1",
            "C = HyperellipticCurve((x^7+x+1-h^2)/4, h)",
            "from sagejs.hyperelliptic_curves.rforest import rforest_hasse_witt_rows",
            "[(r['prime'], r['residues'])",
            " for r in rforest_hasse_witt_rows(C, 5, 7)['rows']]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[(5, (3, 4, 2)), (7, (0, 0, 0))]",
    );
  } finally {
    await session.close();
  }
});

test("genus-2 public rows expose exactly the independent residues", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "from sagejs.hyperelliptic_curves.rforest import rforest_hasse_witt_rows",
            "rows = rforest_hasse_witt_rows(C, 5, 11)['rows']",
            "checked = []",
            "for row in rows:",
            "    if row['available']:",
            "        p = row['prime']",
            "        L = C.local_lpolynomial(p, 'exhaustive')",
            "        expected = tuple(int(L[i]) % p for i in (1, 2))",
            "        checked.append((p, len(row['residues']), row['residues'] == expected))",
            "checked",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[(5, 2, True), (11, 2, True)]",
    );
  } finally {
    await session.close();
  }
});

test("rforest preserves truncation, model exclusions, and checked failures", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^7+x+1)",
            "D = HyperellipticCurve((x^7+x+1)/5)",
            "H = HyperellipticCurve(2^64*x^7+x+1)",
            "from sagejs.hyperelliptic_curves.rforest import rforest_hasse_witt_rows",
            "short = rforest_hasse_witt_rows(C, 2, 19, max_rows=3)",
            "excluded = rforest_hasse_witt_rows(D, 5, 7)",
            "failures = []",
            "for curve, start, stop, cap in [",
            "    (C, 1, 3, 0), (C, 7, 5, 0), (C, 2, 3, -1),",
            "    (C, 2, 3, 1.5), (C, 2, 3, True),",
            "    (H, 5, 5, 0)]:",
            "    try:",
            "        rforest_hasse_witt_rows(curve, start, stop, max_rows=cap)",
            "    except Exception as error:",
            "        failures.append(str(error))",
            "[(short['truncated'], short['required_rows'],",
            "  [r['prime'] for r in short['rows']]),",
            " (excluded['excluded_denominator'],",
            "  [(r['prime'], r['available'], r['status'], r['residues'])",
            "   for r in excluded['rows']]), failures]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[(True, 8, [2, 3, 5]), (5, [(5, False, 'excluded_model', None), " +
        "(7, True, 'direct', (0, 0, 0))]), " +
        "['rforest needs a nonempty closed interval starting at 2', " +
        "'rforest needs a nonempty closed interval starting at 2', " +
        "'max_rows must be nonnegative', 'max_rows must be an integer', " +
        "'max_rows must be an integer', " +
        "'the integral rforest model has a coefficient outside int64']]",
    );
  } finally {
    await session.close();
  }
});

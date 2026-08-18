"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("equation orders use the exact diagonal power lattice and field invariant cache", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.maximal_order import integral_equation_polynomial",
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^3 + QQ(1,2)*x + 1)",
        "polynomial = integral_equation_polynomial(K)",
        "same_polynomial = integral_equation_polynomial(K)",
        "E = K.equation_order()",
        "[str(polynomial), polynomial is same_polynomial, str(E.basis()), E.discriminant(), E is K.equation_order()]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "['x^3 + 2*x + 8', True, '[1, 2*a, 4*a^2]', -1760, True]",
    );
  } finally {
    await session.close();
  }
});

test("fresh public microcases remain Sage-differential, certified, and cache-safe", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.maximal_order_certification import check_certificate",
        "R.<x> = QQ[]",
        "cases = [",
        "    (x^2 - 8, '[1, 1/2*a]', 8),",
        "    (x^3 + x^2 - 2*x + 8, '[1, 1/2*a^2 + 1/2*a, a^2]', -503),",
        "    (x^7 - 2*x + 3, '[1, a, a^2, a^3, a^4, a^5, a^6]', -594390879),",
        "    (x^3 - x - 1, '[1, a, a^2]', -23),",
        "]",
        "checks = []",
        "for polynomial, expected_basis, expected_discriminant in cases:",
        "    K = NumberField(polynomial, 'a')",
        "    O = K.maximal_order()",
        "    bad = dict(O.maximality_certificate())",
        "    bad['order_discriminant'] = bad['order_discriminant'] + 1",
        "    checks.append((str(O.basis()) == expected_basis, O.discriminant() == expected_discriminant, O.is_maximal(), O is K.ring_of_integers(), check_certificate(bad)['certified']))",
        "checks",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[(True, True, True, True, False), (True, True, True, True, False), (True, True, True, True, False), (True, True, True, True, False)]",
    );
  } finally {
    await session.close();
  }
});

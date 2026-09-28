// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("symbolic number-field inputs construct directly from exact coefficients", async () => {
  const session = await createSage();
  try {
    const source = `
import sagejs._baselib.number_fields as nf
R = PolynomialRing(QQ, "x")
checks = []
for expression, expected in [
    (x**2 - x + 12, [12, -1, 1]),
    (x**3 + x - 1, [-1, 1, 0, 1]),
    (x**2 / 2 + x / 3 + QQ(1) / 5, [QQ(1) / 5, QQ(1) / 3, QQ(1) / 2]),
    ((x**2 + 2*x + 3) / 2, [QQ(3) / 2, 1, QQ(1) / 2]),
]:
    polynomial = nf._number_field_polynomial(expression)
    checks.append(polynomial == R(expected) and polynomial.parent() is R)
K = NumberField(x**2 - x + 12, "a")
checks.append(K.discriminant() == -47)
checks.append(K.class_number() == 5)
checks
`;
    assert.equal((await session.evaluate(source)).repr, "[True, True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

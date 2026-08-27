// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const mockCurve = String.raw`
from sagejs.hyperelliptic_curves.jacobian import (
    HyperellipticJacobian,
    JacobianResourceLimitError,
)

class JacobianTestCurve:
    def __init__(self, f, h=0, frobenius=None):
        self._f = f
        self._h = f.parent()(h)
        self._frobenius = frobenius

    def genus(self):
        return (max(self._f.degree(), 2*self._h.degree()) - 1) // 2

    def hyperelliptic_polynomials(self):
        return self._f, self._h

    def base_ring(self):
        return self._f.parent().base_ring()

    def frobenius_polynomial(self, algorithm="auto"):
        return self._frobenius

    def __repr__(self):
        return "Jacobian test curve"
`;

test("Cantor composition agrees with Sage genus-2 and genus-3 vectors", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${mockCurve}
K = GF(13)
R = PolynomialRing(K, "x")
x = R.gen()
S = PolynomialRing(ZZ, "T")
T = S.gen()
J = HyperellipticJacobian(JacobianTestCurve(
    x**5 + 2*x + 1,
    frobenius=T**4 + 4*T**3 + 8*T**2 + 52*T + 169,
))
D1 = J([x**2 + 1, 10*x + 6])
D2 = J([x + 5, 8])
assert D1 + D2 == J([x**2 + 5*x + 2, 9*x + 3])
assert 2*D1 == J([x + 10, 4])
assert D1.order() == 234
assert J.order() == 234
assert J.count_points(3) == [234, 28548, 5107050]
assert (2**256 + 1)*D1 == ((2**256 + 1) % 234)*D1

K3 = GF(5)
R3 = PolynomialRing(K3, "z")
z = R3.gen()
S3 = PolynomialRing(ZZ, "U")
U = S3.gen()
J3 = HyperellipticJacobian(JacobianTestCurve(
    z**7 + z + 1,
    frobenius=(
        U**6 + 3*U**5 + 9*U**4 + 17*U**3
        + 45*U**2 + 75*U + 125
    ),
))
A = J3([z, 1])
assert 2*A == J3([z**2, 3*z + 1])
assert A.order() == 55
assert J3.order() == 275
[D1 + D2, 2*D1, 2*A, A.order()]
`,
    );
    assert.equal(
      result.repr,
      "[(x^2 + 5*x + 2, 9*x + 3), (x + 10, 4), " +
        "(z^2, 3*z + 1), 55]",
    );
  } finally {
    await session.close();
  }
});

test("general h Cantor law handles collisions and canonical negation", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${mockCurve}
R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticJacobian(JacobianTestCurve(
    x**5 - x**4 + x**2 - x,
    h=1,
))
D1 = J([x**2 + x, x])
D2 = J([x**2, x - 1])
assert D1 + D2 == J([x**2 + x, -1])
assert D1 - D1 == J.zero()
assert -D1 == J([x**2 + x, -x - 1])
assert D1 + (-D1) == J.zero()
[D1 + D2, -D1, D1 - D1]
`,
    );
    assert.equal(
      result.repr,
      "[(x^2 + x, -1), (x^2 + x, -x - 1), (1, 0)]",
    );
  } finally {
    await session.close();
  }
});

test(
  "small finite Jacobians exhaustively satisfy the group laws and structure",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        `${mockCurve}
K = GF(3)
R = PolynomialRing(K, "x")
x = R.gen()
S = PolynomialRing(ZZ, "T")
T = S.gen()
J2 = HyperellipticJacobian(JacobianTestCurve(
    x**5 + 1,
    frobenius=T**4 + 9,
))
points2 = J2.points()
assert len(points2) == J2.order() == 10
assert J2.group_structure() == (10,)
assert J2.point_to_divisor((0, 1)) == J2([x, 1])
assert J2((0, 1)) == J2([x, 1])
assert J2([2*x, 1]) == J2([x, 1])
for A in points2:
    assert A + J2.zero() == A
    assert A + (-A) == J2.zero()
    assert 10*A == J2.zero()
    for B in points2:
        assert A + B in points2
        assert A + B == B + A
        for C in points2:
            assert (A + B) + C == A + (B + C)

K5 = GF(5)
R5 = PolynomialRing(K5, "w")
w = R5.gen()
Jnoncyclic = HyperellipticJacobian(JacobianTestCurve(
    w**5 + w + 1,
    frobenius=T**4 + 10*T**2 + 25,
))
assert len(Jnoncyclic.points()) == 36
assert Jnoncyclic.group_structure() == (6, 6)

J3 = HyperellipticJacobian(JacobianTestCurve(
    x**7 + 2*x + 1,
    frobenius=(
        T**6 + 3*T**5 + 6*T**4 + 12*T**3
        + 18*T**2 + 27*T + 27
    ),
))
points3 = J3.points()
assert len(points3) == J3.order() == 94
assert J3.group_structure() == (94,)
A = J3.point_to_divisor((0, 1))
assert A == J3([x, 1])
assert 2*A == J3([x**2, x + 1])
assert A.order() == 94
assert J3.filter_order_candidates([93, 94, 95], [A]) == [94]
sample = J3.random_elements(count=4, max_attempts=20)
assert 1 <= len(sample) <= 4
assert all(D in J3 and 94*D == J3.zero() for D in sample)
for index in range(len(points3)):
    assert 94*points3[index] == J3.zero()
    B = points3[(17*index + 3) % len(points3)]
    C = points3[(43*index + 7) % len(points3)]
    assert (points3[index] + B) + C == points3[index] + (B + C)
[len(points2), J2.group_structure(), Jnoncyclic.group_structure(),
 len(points3), J3.group_structure()]
`,
      );
      assert.equal(result.repr, "[10, (10,), (6, 6), 94, (94,)]");
    } finally {
      await session.close();
    }
  },
);

test("unsupported models and fallback budgets fail explicitly", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${mockCurve}
R2 = PolynomialRing(GF(2), "x")
x2 = R2.gen()
try:
    HyperellipticJacobian(JacobianTestCurve(x2**5 + x2 + 1, h=x2**2 + 1))
    assert False
except NotImplementedError as error:
    assert "characteristic-2" in str(error)

R5 = PolynomialRing(GF(5), "x")
x5 = R5.gen()
S = PolynomialRing(ZZ, "T")
T = S.gen()
try:
    HyperellipticCurve(2*x5**6 + x5 + 1).jacobian()
    assert False
except NotImplementedError as error:
    assert "inert infinity" in str(error)

R3 = PolynomialRing(GF(3), "x")
x3 = R3.gen()
J = HyperellipticJacobian(JacobianTestCurve(
    x3**5 + 1,
    frobenius=T**4 + 9,
))
try:
    J.points(max_elements=9)
    assert False
except JacobianResourceLimitError:
    pass
try:
    J.points(max_candidates=12)
    assert False
except JacobianResourceLimitError:
    pass
try:
    J([x3, 0])
    assert False
except ValueError:
    pass
True
`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("caller-supplied element-order factorizations require prime bases", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.group_structure import validate_factorization",
        "assert validate_factorization(12, [(2,2),(3,1)]) == [(2,2),(3,1)]",
        "try:",
        "    validate_factorization(12, [(12,1)])",
        "    assert False",
        "except ValueError as error:",
        "    assert 'prime' in str(error)",
        "True",
      ].join("\n"),
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("public genus-2 Jacobians validate native invariant factors", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R=PolynomialRing(GF(5),'x')",
        "x=R.gen()",
        "J=HyperellipticCurve(x^5+x+1).jacobian()",
        "native=J.group_structure(algorithm='smalljac')",
        "reference=J.group_structure(algorithm='exhaustive')",
        "assert native == reference == (6,6)",
        "assert native[0]*native[1] == J.order() == 36",
        "[native,reference,J.order()]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[(6, 6), (6, 6), 36]");
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(GF(5),'x'); x=R.gen(); " +
          "HyperellipticCurve(x^7+x+1).jacobian()" +
          ".group_structure(algorithm='smalljac')",
      ),
      /odd-degree genus-2 curve/,
    );
  } finally {
    await session.close();
  }
});

test("Cantor arithmetic uses the extension-field polynomial fallback", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${mockCurve}
K = GF(9, "a")
R = PolynomialRing(K, "x")
x = R.gen()
J = HyperellipticJacobian(JacobianTestCurve(x**5 + 1))
divisors = []
for x_coordinate in K:
    for y_coordinate in K:
        if y_coordinate**2 == x_coordinate**5 + 1:
            divisors.append(J.point_to_divisor((x_coordinate, y_coordinate)))
assert len(divisors) >= 2
for index in range(len(divisors)):
    A = divisors[index]
    B = divisors[(3*index + 1) % len(divisors)]
    C = divisors[(7*index + 2) % len(divisors)]
    assert A + B - A == B
    assert (A + B) + C == A + (B + C)
[len(divisors), all(D in J for D in divisors)]
`,
    );
    assert.match(result.repr, /^\[\d+, True\]$/);
  } finally {
    await session.close();
  }
});

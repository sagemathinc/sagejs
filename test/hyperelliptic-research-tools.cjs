"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const mockCurve = String.raw`
from sagejs.hyperelliptic_curves.jacobian import (
    HyperellipticJacobian,
    JacobianResourceLimitError,
)

class ResearchTestCurve:
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
        return "research test curve"
`;

test("native genus-3 scalar arithmetic is canonical and independently checkable", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${mockCurve}
K = GF(3)
R = PolynomialRing(K, "x")
x = R.gen()
S = PolynomialRing(ZZ, "T")
T = S.gen()
J = HyperellipticJacobian(ResearchTestCurve(
    x**7 + 2*x + 1,
    frobenius=T**6 + 3*T**5 + 6*T**4 + 12*T**3 + 18*T**2 + 27*T + 27,
))
D = J([x, 1])
for scalar in [0, 1, -1, 2, -17, 2**120 + 7]:
    assert D.scalar_multiple(scalar, algorithm="native") == \
        D.scalar_multiple(scalar, algorithm="reference")
assert J.scalar_multiples([D, 2*D], [17, -31]) == [17*D, -62*D]
assert J.annihilation_tests([D, D], [94, 93]) == [True, False]
data = D.to_data()
assert J.divisor_from_data(data) == D
certificate = D.order_certificate(94, [(2,1),(47,1)], algorithm="native")
assert J.verify_order_certificate(certificate)
bad = dict(certificate)
bad["element_order"] = "47"
bad["prime_factors"] = (("47", 1),)
try:
    J.verify_order_certificate(bad)
    assert False
except ArithmeticError:
    pass
assert D.scalar_multiple(2**129 + 1, algorithm="auto") == \
    D.scalar_multiple(2**129 + 1, algorithm="reference")
try:
    D.scalar_multiple(2**129 + 1, algorithm="native")
    assert False
except NotImplementedError:
    pass
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("bounded abelian groups provide certified generators and inverse maps", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${mockCurve}
K = GF(5)
R = PolynomialRing(K, "x")
x = R.gen()
S = PolynomialRing(ZZ, "T")
T = S.gen()
J = HyperellipticJacobian(ResearchTestCurve(
    x**5 + x + 1,
    frobenius=T**4 + 10*T**2 + 25,
))
G, phi = J.abelian_group()
assert G.invariants() == (6, 6)
assert G.order() == J.order() == 36
assert phi.verify()
assert tuple(D.order(algorithm="reference") for D in phi.images()) == (6, 6)
for A in G.gens():
    assert phi(5*A) == 5*phi(A)
for D in J.points():
    assert phi(phi.preimage(D)) == D
Jlimited = HyperellipticJacobian(ResearchTestCurve(
    x**5 + x + 1,
    frobenius=T**4 + 10*T**2 + 25,
))
try:
    Jlimited.abelian_group(max_random_elements=1, seed=1)
    assert False
except JacobianResourceLimitError as error:
    assert error.diagnostics["samples"] <= 1
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("local statistics and good-prime Euler coefficients are exact projections", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-euler-stream-"));
  const output = join(directory, "coefficients.jsonl");
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x**5+x+1)",
        "rows = list(C.local_data(2, 13, extension_degrees=(1,2)))",
        "available = [r for r in rows if r.available]",
        "assert available[0].curve_point_count(2) == 46",
        "assert available[0].jacobian_order_over(1) == 36",
        "assert available[0].jacobian_order_over(2) == available[0].jacobian_extension_orders[2]",
        "ordinary = list(C.local_data(2,13).where(ordinary=True))",
        "assert [r.prime for r in ordinary] == [11,13]",
        "stats = C.local_data(2,13,extension_degrees=2).statistics()",
        "assert stats.records == 6 and stats.available_records == 3",
        "assert stats.coefficient_sums == [sum(r.coefficients[1] for r in available),",
        "                                  sum(r.coefficients[2] for r in available)]",
        "assert stats.normalized_moment(1,2) == sum(QQ(r.coefficients[1]**2)/QQ(r.prime) for r in available)/3",
        "stream = C.good_prime_lseries_coefficients(40)",
        "a = stream.coefficients()",
        "assert a[0] == 0 and a[1] == 1",
        "assert a[25] == a[5]**2 - available[0].coefficients[2]",
        "assert a[35] == a[5]*a[7] == 0",
        `stream.export_jsonl(${JSON.stringify(output)})`,
        "product = C.good_prime_euler_product(2, 13)",
        "assert not product['is_global_lfunction']",
        "assert tuple(product['included_primes']) == tuple(int(r.prime) for r in available)",
        "True",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
    const lines = readFileSync(output, "utf8").trim().split("\n");
    assert.equal(lines.length, 41);
    const header = JSON.parse(lines[0]);
    assert.equal(header.is_global_lfunction, undefined);
    assert.match(header.normalization, /available primes/);
    assert.deepEqual(JSON.parse(lines[1]), {
      index: "1",
      type: "coefficient",
      value: "1",
    });
  } finally {
    await session.close();
    rmSync(directory, { recursive: true });
  }
});

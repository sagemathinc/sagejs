"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const setup = String.raw`
from sagejs.hyperelliptic_curves.jacobian import HyperellipticJacobian
from sagejs.hyperelliptic_curves.genus2_kummer import (
    classical_duplication_l1_bound,
    classical_duplication_raw,
    divisor_provenance,
    duplicate_kummer,
    duplicate_kummer_coordinates,
    exact_model_capability,
    kummer_coordinates,
)
from sagejs.hyperelliptic_curves.genus2_heights import (
    Genus2HeightCapabilityError,
    Genus2HeightResolutionError,
    HeightContext,
    automatic_height_bounds,
    canonical_height,
    factorization_free_finite_correction,
    height_pairing,
    regulator,
)
from sagejs.number_fields.class_unit_analytic import RealBall

class HeightTestCurve:
    def __init__(self, f, h=0):
        self._f = f
        self._h = f.parent()(h)

    def genus(self):
        return (max(self._f.degree(), 2*self._h.degree()) - 1) // 2

    def hyperelliptic_polynomials(self):
        return self._f, self._h

    def base_ring(self):
        return self._f.parent().base_ring()

    def __repr__(self):
        return "height test curve"
`;

test("exact QQ Kummer coordinates cover classical and generalized odd models", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticJacobian(HeightTestCurve(x**5 - x + 1))
P = J([x, 1])
Q = J([x - 1, 1])
assert kummer_coordinates(J.zero()).coordinates() == (0, 0, 0, 1)
assert kummer_coordinates(P).coordinates() == (0, 1, 0, 0)
assert kummer_coordinates(Q).coordinates() == (0, 1, 1, 1)
assert duplicate_kummer(P) == kummer_coordinates(2*P)
assert kummer_coordinates(P) == kummer_coordinates(-P)
K = kummer_coordinates(P)
multiple = P
for _ in range(5):
    K = duplicate_kummer_coordinates(K)
    multiple = 2*multiple
    assert K == kummer_coordinates(multiple)
raw = classical_duplication_raw(J, kummer_coordinates(Q).coordinates())
l1 = classical_duplication_l1_bound(J)
assert max(abs(value) for value in raw) <= l1 * max(
    abs(value) for value in kummer_coordinates(Q).coordinates()
)**4
data = divisor_provenance(P)
assert data["schema"] == "sagejs.hyperelliptic.qq-mumford-divisor.v1"
assert data["model"]["f_coefficients_ascending"] == ("1", "-1", "0", "0", "0", "1")

Jg = HyperellipticJacobian(HeightTestCurve(x**5 - x**4 + x**2 - x, 1))
D = Jg([x**2 + x, x])
assert kummer_coordinates(D).coordinates() == (1, -1, 0, 2)
assert kummer_coordinates(D) == kummer_coordinates(-D)
assert duplicate_kummer(D) == kummer_coordinates(2*D)
Kg = kummer_coordinates(D)
multiple_g = D
for _ in range(4):
    Kg = Kg.duplicate()
    multiple_g = 2*multiple_g
    assert Kg == kummer_coordinates(multiple_g)

R3 = PolynomialRing(QQ, "z")
z = R3.gen()
J3 = HyperellipticJacobian(HeightTestCurve(z**7 + z + 1))
assert not exact_model_capability(J3)
[
    kummer_coordinates(P).coordinates(),
    kummer_coordinates(D).coordinates(),
    duplicate_kummer(D).coordinates(),
    data["schema"],
    exact_model_capability(J3).reason,
]
`,
    );
    assert.equal(
      result.repr,
      "[(0, 1, 0, 0), (1, -1, 0, 2), (81, -35, -11, 4), " +
        "'sagejs.hyperelliptic.qq-mumford-divisor.v1', " +
        "'exact Kummer coordinates require a genus-2 Jacobian']",
    );
  } finally {
    await session.close();
  }
});

test("automatic global bounds give shrinking certified heights and cache exact chains", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticJacobian(HeightTestCurve(x**5 - x + 1))
P = J([x, 1])
context = HeightContext(J)
bounds = automatic_height_bounds(J, precision=80)
h2 = canonical_height(P, steps=2, precision=80, context=context)
h4 = canonical_height(P, steps=4, precision=80, context=context)
h6 = canonical_height(P, steps=6, precision=80, context=context)
h6_again = canonical_height(P, steps=6, precision=80, context=context)
assert bounds.correction_lower.is_negative()
assert bounds.correction_upper.is_positive()
assert h2.rigorous and h4.rigorous and h6.rigorous
assert h2.status == h4.status == h6.status == "certified-enclosure"
assert h4.ball.width() < h2.ball.width()
assert h6.ball.width() < h4.ball.width()
assert h2.ball.intersection(h4.ball).intersection(h6.ball)
assert h6.ball.lower == h6_again.ball.lower
assert h6.ball.upper == h6_again.ball.upper
diagnostics = context.diagnostics()
assert diagnostics["chain_cache_hits"] > 0
assert diagnostics["direct_kummer_quartic_doublings"] > 0
assert diagnostics["automatic_bound_precisions"] == (80,)
assert h6.diagnostics["local_corrections"]["status"] == (
    "certified-partial-sums-and-tails"
)

finite4 = factorization_free_finite_correction(P, precision=80, steps=4)
finite8 = factorization_free_finite_correction(P, precision=80, steps=8)
assert finite4.rigorous and finite8.rigorous
assert finite4.ball.intersection(finite8.ball)
assert finite8.ball.width() < finite4.ball.width()
assert not finite8.diagnostics["factorization_used"]

Jbad = HyperellipticJacobian(HeightTestCurve(x**5 + 4*x + 4))
Pbad = Jbad([x, 2])
finite_bad = factorization_free_finite_correction(Pbad, precision=80)
height_bad = canonical_height(Pbad, steps=8, precision=100)
assert finite_bad.diagnostics["raw_duplication_gcds"][0] == "16"
assert height_bad.diagnostics["local_corrections"]["raw_duplication_gcds"][0] == "16"
assert height_bad.ball.contains(
    "0.42678333558746747233428100338279869019877473010608"
)

twice = canonical_height(2*P, steps=5, precision=80, context=context)
assert h6.ball.intersection(twice.ball / RealBall(4, precision_bits=80))

Jt = HyperellipticJacobian(HeightTestCurve(x**5 - x))
T = Jt([x, 0])
zero = canonical_height(T, torsion_order=2, precision=80)
assert zero.status == "exact-torsion-zero" and zero.ball.contains_zero()
assert zero.ball.width().numerator == 0
[
    h2.status,
    h2.ball.width() > h4.ball.width() > h6.ball.width(),
    diagnostics["chain_cache_hits"] > 0,
    diagnostics["direct_kummer_quartic_doublings"] > 0,
    zero.status,
]
`,
    );
    assert.equal(
      result.repr,
      "['certified-enclosure', True, True, True, 'exact-torsion-zero']",
    );
  } finally {
    await session.close();
  }
});

test("pairings, regulators, and integral basis transforms preserve normalization", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticJacobian(HeightTestCurve(x**5 - x + 1))
P = J([x, 1])
Q = J([x - 1, 1])
context = HeightContext(J)
pairing = height_pairing([P, Q], steps=6, precision=80, context=context)
assert pairing.rigorous
assert pairing[0][1].lower == pairing[1][0].lower
assert pairing[0][1].upper == pairing[1][0].upper

transformed = pairing.transform([[1, 1], [0, 1]])
recomputed = height_pairing([P, P + Q], steps=6, precision=80, context=context)
for i in range(2):
    for j in range(2):
        assert transformed[i][j].intersection(recomputed[i][j])

reg = regulator([P, Q], steps=6, precision=80, context=context)
assert reg.rigorous and reg.status == "certified-positive" and reg.ball.is_positive()
scaled = reg.transform_index(3)
assert scaled.ball.intersection(reg.ball * RealBall(9, precision_bits=80))

dependent_rejected = False
try:
    regulator([P, 2*P], steps=4, precision=80, context=context)
except Genus2HeightResolutionError as error:
    dependent_rejected = error.diagnostics["status"] == "unresolved-independence"
assert dependent_rejected
[pairing.rigorous, reg.status, scaled.diagnostics["subgroup_index"], dependent_rejected]
`,
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "[True, 'certified-positive', '3', True]",
    );
  } finally {
    await session.close();
  }
});

test("unsupported automatic models remain numerical unless a proof bound is supplied", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticJacobian(HeightTestCurve(x**5 - x**4 + x**2 - x, 1))
D = J([x**2 + x, x])
reference = canonical_height(D, steps=3, precision=80)
certified = canonical_height(D, steps=3, precision=80, height_difference_bound=100)
assert reference.status == "numerical-reference" and not reference.rigorous
assert certified.status == "certified-enclosure" and certified.rigorous

unsupported = False
try:
    automatic_height_bounds(J, precision=80)
except Genus2HeightCapabilityError as error:
    unsupported = error.diagnostics["automatic_bound"] == "unsupported-generalized-h"
assert unsupported

float_rejected = False
try:
    canonical_height(D, height_difference_bound=0.1)
except TypeError:
    float_rejected = True
assert float_rejected
[reference.status, certified.status, unsupported, float_rejected]
`,
    );
    assert.equal(
      result.repr,
      "['numerical-reference', 'certified-enclosure', True, True]",
    );
  } finally {
    await session.close();
  }
});

test("canonical heights and regulator contain a genuine Magma V2.18 oracle", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticJacobian(HeightTestCurve(x**5 - x + 1))
P = J([x, 1])
Q = J([x - 1, 1])
context = HeightContext(J)
hP = canonical_height(P, steps=8, precision=100, context=context)
hQ = canonical_height(Q, steps=8, precision=100, context=context)
pair = height_pairing([P, Q], steps=8, precision=100, context=context)
reg = regulator([P, Q], steps=8, precision=100, context=context)
magma_hP = "0.55175981952139493925311708933354526634108654109670"
magma_hQ = "0.16986232826351184005994273179501892342244604109528"
magma_pair = "-0.066251639356115110899930110247405391341603180513356"
magma_reg = "0.089333927868786494835785498946943974108234120001758"
assert hP.ball.contains(magma_hP)
assert hQ.ball.contains(magma_hQ)
assert pair[0][1].contains(magma_pair)
assert reg.ball.contains(magma_reg)
[
    hP.ball.contains(magma_hP),
    pair[0][1].contains(magma_pair),
    reg.ball.contains(magma_reg),
]
`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True]");
  } finally {
    await session.close();
  }
});

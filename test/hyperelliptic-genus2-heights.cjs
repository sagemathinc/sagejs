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
    AutomaticHeightBounds,
    Genus2HeightCapabilityError,
    Genus2HeightResourceLimitError,
    Genus2HeightResolutionError,
    HeightContext,
    automatic_height_bounds,
    canonical_height,
    factorization_free_finite_correction,
    height_pairing,
    normalized_archimedean_correction,
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

# Regression for the full h2 != 0 Kummer isomorphism.  The h1*h2*k3 term
# that once appeared here is extraneous under Y=2*y+h.
hr = x**2 + x + 1
ur = x**2 + x + 1
vr = x
qr = x**3 + 2*x + 3
fr = vr**2 + hr*vr + ur*qr
Jr = HyperellipticJacobian(HeightTestCurve(fr, hr))
Dr = Jr([ur, vr])
assert duplicate_kummer(Dr).coordinates() == (4, -1, -3, 1)
assert duplicate_kummer(Dr) == kummer_coordinates(2*Dr)

# Seeded constructed-divisor differential corpus.  Since
# f=v^2+h*v+u*q, every (u,v) below is an exact Mumford divisor.  Comparing
# several direct quartic iterates with Cantor keeps both the generalized
# transform and the classical coefficient tables independently covered.
state = 1729
generalized_checked = 0
classical_checked = 0
for case_index in range(18):
    values = []
    for _coefficient_index in range(9):
        state = (1103515245*state + 12345) % (2**31)
        values.append((state % 7) - 3)
    a, b, c, d, e, r, g, i, j = values
    h_seed = x**2 + a*x + b
    u_seed = x**2 + c*x + d
    v_seed = e*x + r
    q_seed = x**3 + g*x**2 + i*x + j
    f_seed = v_seed**2 + h_seed*v_seed + u_seed*q_seed
    if (4*f_seed + h_seed**2).discriminant() != 0:
        J_seed = HyperellipticJacobian(HeightTestCurve(f_seed, h_seed))
        D_seed = J_seed([u_seed, v_seed])
        K_seed = kummer_coordinates(D_seed)
        M_seed = D_seed
        for _step in range(3):
            K_seed = K_seed.duplicate()
            M_seed = 2*M_seed
            assert K_seed == kummer_coordinates(M_seed)
        generalized_checked += 1

    f_classical = v_seed**2 + u_seed*q_seed
    if f_classical.discriminant() != 0:
        J_classical = HyperellipticJacobian(HeightTestCurve(f_classical))
        D_classical = J_classical([u_seed, v_seed])
        K_classical = kummer_coordinates(D_classical)
        M_classical = D_classical
        for _step in range(3):
            K_classical = K_classical.duplicate()
            M_classical = 2*M_classical
            assert K_classical == kummer_coordinates(M_classical)
        classical_checked += 1
assert generalized_checked >= 12
assert classical_checked >= 12

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

# For the binary sextic F(X,Z)=Z*f_hom(X,Z), the Mueller--Stoll constant
# includes lc(f)^2.  Omitting it loses the first local content 25 here.
f_nonmonic = 5*x**5 + x**4 - x + 1
J_nonmonic = HyperellipticJacobian(HeightTestCurve(f_nonmonic))
P_nonmonic = J_nonmonic([x, 1])
finite_nonmonic = factorization_free_finite_correction(
    P_nonmonic, precision=80, steps=1
)
height_nonmonic = canonical_height(
    P_nonmonic, precision=100, target_bits=96, algorithm="local"
)
expected_D = 16 * 5**2 * abs(int(str(f_nonmonic.discriminant())))
assert finite_nonmonic.diagnostics["discriminant_bound_D"] == str(expected_D)
assert height_nonmonic.bounds.diagnostics["mueller_stoll_discriminant_bound"] == str(
    expected_D
)
assert finite_nonmonic.diagnostics["raw_duplication_gcds"][0] == "25"
assert height_nonmonic.diagnostics["exact_small_step_oracle"]["finite_gcds"][0] == (
    "25"
)
assert height_nonmonic.ball.contains(
    "0.71938561843064084750898177991281388442829705692175948669319594"
)
assert finite_nonmonic.ball.lower > RealBall("0.8", precision_bits=80).lower
tampered_context = HeightContext(J_nonmonic)
tampered_tables = [list(table) for table in tampered_context._classical_duplication_terms]
tampered = False
for table in tampered_tables:
    for index, term in enumerate(table):
        if term[1:] == (0, 4, 0, 0):
            table[index] = (term[0] + 1,) + term[1:]
            tampered = True
            break
    if tampered:
        break
assert tampered
tampered_context._classical_duplication_terms = tuple(
    tuple(table) for table in tampered_tables
)
try:
    canonical_height(
        P_nonmonic,
        steps=8,
        precision=100,
        algorithm="local",
        context=tampered_context,
    )
    assert False
except Genus2HeightCapabilityError as error:
    assert "do not match" in str(error)

twice = canonical_height(2*P, steps=5, precision=80, context=context)
assert h6.ball.intersection(twice.ball / RealBall(4, precision_bits=80))

Jt = HyperellipticJacobian(HeightTestCurve(x**5 - x))
T = Jt([x, 0])
zero = canonical_height(T, torsion_order=2, precision=80)
assert zero.status == "exact-torsion-zero" and zero.ball.contains_zero()
assert zero.ball.width().numerator == 0
assert zero.verify(T)
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
assert transformed.verify([P, Q])

reg = regulator([P, Q], steps=6, precision=80, context=context)
assert reg.rigorous and reg.status == "certified-positive" and reg.ball.is_positive()
scaled = reg.transform_index(3)
assert scaled.ball.intersection(reg.ball * RealBall(9, precision_bits=80))
assert scaled.verify([P, Q])

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

test("caller-supplied bounds remain explicit unverified assumptions", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticJacobian(HeightTestCurve(x**5 - x**4 + x**2 - x, 1))
D = J([x**2 + x, x])
reference = canonical_height(D, steps=3, precision=80)
conditional = canonical_height(D, steps=3, precision=80, height_difference_bound=100)
assert reference.status == "numerical-reference" and not reference.rigorous
assert conditional.status == "conditional-supplied-bound"
assert not conditional.rigorous
assert conditional.bounds.diagnostics["proof_status"] == (
    "unverified-caller-assumption"
)
assert conditional.diagnostics["local_corrections"]["status"] == (
    "unavailable-for-undifferentiated-supplied-total-bound"
)
conditional_sealed = False
try:
    conditional._rigorous = True
except AttributeError:
    conditional_sealed = True
assert conditional_sealed and not conditional.rigorous
assert conditional.verify(D, height_difference_bound=100)

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
[reference.status, conditional.status, unsupported, float_rejected]
`,
    );
    assert.equal(
      result.repr,
      "['numerical-reference', 'conditional-supplied-bound', True, True]",
    );
  } finally {
    await session.close();
  }
});

test("rigorous bounds and specialized quartics are model-bound and unforgeable", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticJacobian(HeightTestCurve(x**5 - x + 1))
P = J([x, 1])
J_other = HyperellipticJacobian(HeightTestCurve(x**5 + x + 1))
P_other = J_other([x, 1])
valid = automatic_height_bounds(J, precision=96)
cross_model = automatic_height_bounds(J_other, precision=96)
forged = AutomaticHeightBounds(
    RealBall(100, precision_bits=96),
    RealBall(100, precision_bits=96),
    {"automatic_bound": "certified"},
)
forged_rejected = False
try:
    normalized_archimedean_correction(P, precision=96, steps=4, bounds=forged)
except Genus2HeightCapabilityError:
    forged_rejected = True
cross_model_rejected = False
try:
    normalized_archimedean_correction(P, precision=96, steps=4, bounds=cross_model)
except Genus2HeightCapabilityError:
    cross_model_rejected = True

context = HeightContext(J)
tables = [list(table) for table in context._classical_duplication_terms]
term = tables[0][0]
tables[0][0] = (term[0] + 1,) + term[1:]
tampered = tuple(tuple(table) for table in tables)
finite_rejected = False
try:
    factorization_free_finite_correction(
        P, precision=96, steps=4, specialized_terms=tampered
    )
except Genus2HeightCapabilityError:
    finite_rejected = True
arch_rejected = False
try:
    normalized_archimedean_correction(
        P,
        precision=96,
        steps=4,
        bounds=valid,
        specialized_terms=tampered,
    )
except Genus2HeightCapabilityError:
    arch_rejected = True
context._classical_duplication_terms = tampered
context_rejected = False
try:
    canonical_height(P, precision=96, steps=9, algorithm="local", context=context)
except Genus2HeightCapabilityError:
    context_rejected = True
assert (
    forged_rejected
    and cross_model_rejected
    and finite_rejected
    and arch_rejected
    and context_rejected
)
[
    forged_rejected,
    cross_model_rejected,
    finite_rejected,
    arch_rejected,
    context_rejected,
]
`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True]");
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
# Independent seeded degree-two Mumford fixture, constructed in Magma as
# J![x^2-2*x+3, -3*x-1].
u_seed = x**2 - 2*x + 3
v_seed = -3*x - 1
q_seed = x**3 - 3*x**2 + 2*x + 2
J_seed = HyperellipticJacobian(HeightTestCurve(v_seed**2 + u_seed*q_seed))
seeded_height = canonical_height(J_seed([u_seed, v_seed]), steps=6, precision=100)
magma_hP = "0.55175981952139493925311708933354526634108654109670"
magma_hQ = "0.16986232826351184005994273179501892342244604109528"
magma_pair = "-0.066251639356115110899930110247405391341603180513356"
magma_reg = "0.089333927868786494835785498946943974108234120001758"
magma_seeded = "2.5155984869871381291510973670868432324986670033572"
assert hP.ball.contains(magma_hP)
assert hQ.ball.contains(magma_hQ)
assert pair[0][1].contains(magma_pair)
assert reg.ball.contains(magma_reg)
assert seeded_height.ball.contains(magma_seeded)
approximation_data = hP.diagnostics["terminal_limit_approximation"]
approximation = RealBall(
    approximation_data["lower"],
    approximation_data["upper"],
    rigorous=False,
)
strong_oracle_tolerance = (
    approximation.lower > RealBall("0.551744").lower
    and approximation.upper < RealBall("0.551776").upper
)
assert strong_oracle_tolerance
assert hP.diagnostics["enclosure_width_bits"] >= 9
[
    hP.ball.contains(magma_hP),
    pair[0][1].contains(magma_pair),
    reg.ball.contains(magma_reg),
    seeded_height.ball.contains(magma_seeded),
    strong_oracle_tolerance,
]
`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("height records and caches resist mutation and support strict replay", async () => {
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
context_immutable = False
try:
    context.max_exact_coordinate_bits = 999999999
except AttributeError:
    context_immutable = True
assert context_immutable and context.max_exact_coordinate_bits == 100000

K = kummer_coordinates(P)
coordinates_before = K.coordinates()
kdata = K.to_dict()
kdata["coordinates"] = ("9", "9", "9", "9")
kdata["divisor"]["model"]["equation"] = "poisoned"
assert K.coordinates() == coordinates_before
assert K.to_dict()["divisor"]["model"]["equation"] != "poisoned"

cached_K = context.kummer(P)
cached_kummer_sealed = False
try:
    cached_K._coordinates = (0, 0, 0, 1)
except AttributeError:
    cached_kummer_sealed = True
assert cached_kummer_sealed
assert context.kummer(P).coordinates() == coordinates_before
assert canonical_height(P, steps=2, precision=80, context=context).status != (
    "exact-torsion-zero"
)
private_provenance_sealed = False
try:
    cached_K._provenance["model"] = "poisoned"
except TypeError:
    private_provenance_sealed = True
assert private_provenance_sealed

capability = exact_model_capability(J)
capdata = capability.diagnostics
capdata["algorithm"] = "poisoned"
assert capability.diagnostics["algorithm"] != "poisoned"

bounds = context.automatic_bounds(80)
lower_before = bounds.correction_lower.lower
bounds.correction_lower.lower = RealBall(999).lower
bounds._correction_lower.lower = RealBall(999).lower
bounds_data = bounds.diagnostics
bounds_data["automatic_bound"] = "poisoned"
assert bounds.correction_lower.lower == lower_before
assert context.automatic_bounds(80).diagnostics["automatic_bound"] == "certified"

chain_copy = list(context.chain(P, 4))
chain_copy[0] = kummer_coordinates(Q)
assert context.chain(P, 4)[0] == kummer_coordinates(P)

height = canonical_height(P, steps=4, precision=80, context=context)
height_lower = height.ball.lower
height.ball.lower = RealBall(999).lower
height._ball.lower = RealBall(999).lower
height_data = height.diagnostics
height_data["algorithm"] = "poisoned"
provenance = height.provenance
provenance["model"]["equation"] = "poisoned"
assert height.ball.lower == height_lower
assert height.diagnostics["algorithm"] != "poisoned"
assert height.provenance["model"]["equation"] != "poisoned"
private_diagnostics_sealed = False
try:
    height._diagnostics["algorithm"] = "poisoned"
except TypeError:
    private_diagnostics_sealed = True
assert private_diagnostics_sealed
height_verified = height.verify(P)
assert height_verified

pair = height_pairing([P, Q], steps=4, precision=80)
matrix_copy = pair.matrix
matrix_copy[0][0].lower = RealBall(999).lower
pair._matrix[0][0].lower = RealBall(999).lower
assert pair[0][0].lower != RealBall(999).lower
pair_verified = pair.verify([P, Q])
assert pair_verified
pair_sealed = False
try:
    pair._rigorous = False
except AttributeError:
    pair_sealed = True
assert pair_sealed and pair.rigorous

reg = regulator([P, Q], steps=6, precision=80)
reg.ball.lower = RealBall(999).lower
reg._ball.lower = RealBall(999).lower
assert reg.ball.lower != RealBall(999).lower
reg_verified = reg.verify([P, Q])
assert reg_verified
regulator_sealed = False
try:
    reg._rigorous = False
except AttributeError:
    regulator_sealed = True
assert regulator_sealed and reg.rigorous

limited = False
try:
    canonical_height(
        P,
        steps=8,
        precision=80,
        algorithm="exact",
        context=HeightContext(J, max_exact_coordinate_bits=1024),
    )
except Genus2HeightResourceLimitError as error:
    limited = error.diagnostics["max_exact_coordinate_bits"] == 1024
assert limited

# Regression: rational coefficient denominators participate in the resource
# estimate, and a post-duplication exact check prevents an underestimated
# quartic from entering the persistent chain cache.
denominator = 2**5000
Jr = HyperellipticJacobian(HeightTestCurve(x**5 + x/denominator + 1))
Pr = Jr([x, 1])
rational_limited = False
try:
    HeightContext(Jr, max_exact_coordinate_bits=1024).chain(Pr, 1)
except Genus2HeightResourceLimitError as error:
    rational_limited = (
        error.diagnostics["max_exact_coordinate_bits"] == 1024
        and error.diagnostics["resource_check_stage"] in (
            "pre-duplication-estimate",
            "post-duplication-exact",
        )
    )
assert rational_limited
[
    height_verified,
    pair_verified,
    reg_verified,
    limited,
    context_immutable,
    cached_kummer_sealed,
    pair_sealed,
    regulator_sealed,
    rational_limited,
    private_provenance_sealed,
    private_diagnostics_sealed,
]
`,
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "[True, True, True, True, True, True, True, True, True, True, True]",
    );
  } finally {
    await session.close();
  }
});

// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("genus-3 cyclic structures avoid exhaustive Mumford enumeration", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
R13 = PolynomialRing(GF(13), "x")
x13 = R13.gen()
J13 = HyperellipticCurve(x13**7 + 2*x13 + 1).jacobian()
assert J13.order() == 2160
assert J13.group_structure(seed=1) == (2160,)
diagnostics13 = J13.group_structure_diagnostics()
assert diagnostics13["algorithm"] == "basis"
assert diagnostics13["samples"] <= 8
assert diagnostics13["generated_subgroup_order"] == 2160
G13, phi13 = J13.abelian_group(seed=1)
assert G13.invariants() == (2160,)
assert phi13.images()[0].order() == 2160
assert phi13.preimage(phi13(777*G13.gen(0))) == 777*G13.gen(0)

R19 = PolynomialRing(GF(19), "x")
x19 = R19.gen()
J19 = HyperellipticCurve(x19**7 + 2*x19 + 1).jacobian()
assert J19.order() == 6490
assert J19.group_structure(seed=1) == (6490,)
diagnostics19 = J19.group_structure_diagnostics()
assert diagnostics19["algorithm"] == "squarefree-order"
assert diagnostics19["samples"] == 0
assert J19.group_structure(algorithm="basis", seed=1) == (6490,)
G19, phi19 = J19.abelian_group(algorithm="basis", seed=1)
assert G19.invariants() == (6490,)
assert phi19.images()[0].order() == 6490
assert phi19.preimage(phi19(1234*G19.gen(0))) == 1234*G19.gen(0)
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("sampled bases provide exact maps and independently checked certificates", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
import json
R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**5 + x + 1).jacobian()
assert J.order() == 36
assert J.group_structure(algorithm="basis", seed=2) == (6, 6)
G, phi = J.abelian_group(seed=2)
assert G.invariants() == (6, 6)
assert phi.verify()
for a in range(6):
    for b in range(6):
        A = G((a, b))
        assert phi.preimage(phi(A)) == A

certificate = J.group_structure_certificate(seed=2)
assert J.verify_group_structure_certificate(certificate)
roundtrip = json.loads(json.dumps(certificate))
assert J.verify_group_structure_certificate(roundtrip)

bad = json.loads(json.dumps(certificate))
bad["invariant_factors"][0] = "3"
try:
    J.verify_group_structure_certificate(bad)
    assert False
except ArithmeticError:
    pass

bad = json.loads(json.dumps(certificate))
old = int(bad["generators"][0]["v_coefficients_ascending"][0])
bad["generators"][0]["v_coefficients_ascending"][0] = str((old + 1) % 5)
try:
    J.verify_group_structure_certificate(bad)
    assert False
except (ValueError, ArithmeticError):
    pass

for mutation, errors in (
    (("schema", "wrong.v1"), (ValueError,)),
    (("group_order", "35"), (ArithmeticError,)),
):
    bad = json.loads(json.dumps(certificate))
    bad[mutation[0]] = mutation[1]
    try:
        J.verify_group_structure_certificate(bad)
        assert False
    except errors:
        pass

bad = json.loads(json.dumps(certificate))
bad["curve"]["prime"] = "7"
try:
    J.verify_group_structure_certificate(bad)
    assert False
except ValueError:
    pass

bad = json.loads(json.dumps(certificate))
bad["factorization"][0][1] = 1
try:
    J.verify_group_structure_certificate(bad)
    assert False
except ValueError:
    pass

bad = json.loads(json.dumps(certificate))
bad["proof"]["generated_subgroup_order"] = "18"
try:
    J.verify_group_structure_certificate(bad)
    assert False
except ArithmeticError:
    pass

bad = json.loads(json.dumps(certificate))
bad["proof"]["primary_components"][0]["generated_order"] = "1"
try:
    J.verify_group_structure_certificate(bad)
    assert False
except ArithmeticError:
    pass
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("lift-u enumeration is exact and resource bounded", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.jacobian import JacobianResourceLimitError
R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**5 + x + 1).jacobian()
points = J.points()
assert len(points) == J.order() == 36
for D in points:
    assert D in J.lift_u(D[0], all=True)
try:
    J.change_ring(GF(5)).points(max_candidates=30)
    assert False
except JacobianResourceLimitError:
    pass

limited = HyperellipticCurve(x**5 + x + 1).jacobian()
try:
    limited.group_structure(
        algorithm="basis", max_random_elements=1, seed=1
    )
    assert False
except JacobianResourceLimitError as error:
    assert error.diagnostics["samples"] <= 1
    assert error.partial_generators is not None
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("generic bases handle generalized models and rank-three groups", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
R = PolynomialRing(GF(5), "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1, x**2 + 1)
J = C.jacobian()
assert J.order() == 32
assert J.group_structure(algorithm="basis", seed=3) == (2, 2, 8)
G, phi = J.abelian_group(algorithm="basis", seed=3)
assert G.invariants() == (2, 2, 8)
assert tuple(D.order() for D in phi.images()) == (2, 2, 8)
assert phi.verify()
for coordinates in ((1,0,0), (0,1,0), (1,1,7), (0,0,4)):
    A = G(coordinates)
    assert phi.preimage(phi(A)) == A
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("sampled structures differentially match complete small Jacobians", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
fixtures = (
    (3, 2, (1,0,0,0,0,1), (0,)),
    (3, 3, (1,2,0,0,0,0,0,1), (0,)),
    (5, 2, (1,1,0,0,0,1), (1,0,1)),
)
for prime, genus, f_values, h_values in fixtures:
    R = PolynomialRing(GF(prime), "x")
    f = R(list(f_values))
    h = R(list(h_values))
    expected = HyperellipticCurve(f, h).jacobian().group_structure(
        algorithm="exhaustive"
    )
    for seed in (0, 7):
        J = HyperellipticCurve(f, h).jacobian()
        assert J.group_structure(algorithm="basis", seed=seed) == expected
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("factorization and certificate ingress reject lossy integers", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.group_structure import validate_factorization
for bad in (True, 2.5, QQ(5)/2):
    try:
        validate_factorization(12, [(bad, 2), (3, 1)])
        assert False
    except (TypeError, ValueError):
        pass
for bad in (True, 2.5, QQ(5)/2):
    try:
        validate_factorization(12, [(2, bad), (3, 1)])
        assert False
    except (TypeError, ValueError):
        pass
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("Sutherland primary bases and vector logs work in rank three", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.abelian_group import FiniteAbelianGroup
from sagejs.hyperelliptic_curves.group_structure import (
    GroupOperationBudget,
    JacobianResourceLimitError,
    basis_from_generators,
    coordinates_in_basis,
    discrete_log_pgroup,
)
A = FiniteAbelianGroup((2, 4, 12))
a, b, c = A.gens()
source = (a+b+c, b+5*c, a+3*b, c)
orders = tuple(value.order() for value in source)
budget = GroupOperationBudget(1000000, 100000, 64*1024*1024, "reference")
basis, descending = basis_from_generators(
    source, orders, [(2,5),(3,1)], budget
)
assert tuple(reversed(descending)) == (2,4,12)
invariant_basis = tuple(reversed(basis))
target = 1*a + 3*b + 11*c
coordinates = coordinates_in_basis(
    target,
    invariant_basis,
    (2,4,12),
    [(2,5),(3,1)],
    budget,
)
answer = A.zero()
for coordinate, generator in zip(coordinates, invariant_basis):
    answer += coordinate*generator
assert answer == target

for budget in (
    GroupOperationBudget(0, 100, 1024*1024, "reference"),
    GroupOperationBudget(10000, 0, 1024*1024, "reference"),
    GroupOperationBudget(10000, 100, 0, "reference"),
):
    try:
        discrete_log_pgroup(2, (1,), (a,), a, budget)
        assert False
    except JacobianResourceLimitError:
        pass
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

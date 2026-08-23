"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("group consumers reuse prepared scalar, addition, and sum batches", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.group_structure import (
    GroupOperationBudget,
    add_pairs_batched,
    element_order_from_multiple,
    group_element_key,
)
R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**5 + x + 1, x**2 + 1).jacobian()
points = J.points()
D = next(value for value in points if not value.is_zero())

class InstrumentedPrepared:
    def __init__(self):
        self.native_available = True
        self.scalar_batches = 0
        self.add_batches = 0
        self.sums = 0
    def scalar_batch(
        self, elements, scalars, algorithm=None, max_group_operations=None
    ):
        self.scalar_batches += 1
        return tuple(
            element._scalar_multiple_reference(scalar)
            for element, scalar in zip(elements, scalars)
        )
    def add_batch(self, left, right):
        self.add_batches += 1
        answer = []
        for a, b in zip(left, right):
            u, v = J._compose(a[0], a[1], b[0], b[1])
            answer.append(J._element(u, v, False))
        return tuple(answer)
    def sum(self, elements):
        self.sums += 1
        answer = J.zero()
        for element in elements:
            u, v = J._compose(answer[0], answer[1], element[0], element[1])
            answer = J._element(u, v, False)
        return answer

prepared = InstrumentedPrepared()
def prepared_factory(algorithm="auto", max_batch_items=100000):
    return prepared
J.prepared_arithmetic = prepared_factory

factors = [(2, 5)]
actual_order = element_order_from_multiple(
    D, 32, factors, scalar_algorithm="auto"
)
assert actual_order == D.order(
    multiple=32, factorization=factors, algorithm="reference"
)
assert prepared.scalar_batches == 1

budget = GroupOperationBudget(100000, 1000, 1024*1024, "auto")
value = budget.linear_combination(
    (3, 5), (D, D._scalar_multiple_reference(2))
)
assert value == D._scalar_multiple_reference(13)
assert prepared.scalar_batches == 2
assert prepared.sums == 1

pair = add_pairs_batched(
    (D, D._scalar_multiple_reference(2)),
    (D._scalar_multiple_reference(3), D._scalar_multiple_reference(4)),
    algorithm="auto",
)
assert pair == (
    D._scalar_multiple_reference(4), D._scalar_multiple_reference(6)
)
assert prepared.add_batches == 1
assert group_element_key(D) == group_element_key(J(D))

prepared.native_available = False
fallback_budget = GroupOperationBudget(100000, 1000, 1024*1024, "auto")
assert fallback_budget.linear_combination(
    (3, 5), (D, D._scalar_multiple_reference(2))
) == D._scalar_multiple_reference(13)
assert prepared.scalar_batches == 2
assert prepared.sums == 1
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("rank-three structure and maps retain exact reference certificates", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**5 + x + 1, x**2 + 1).jacobian()
assert J.order() == 32
assert J.group_structure(algorithm="basis", seed=3) == (2, 2, 8)
G, phi = J.abelian_group(algorithm="basis", seed=3)
assert G.invariants() == (2, 2, 8)
assert phi.verify()
certificate = J.group_structure_certificate(algorithm="basis", seed=3)
assert certificate["algorithms"]["group_law"] == "generalized-cantor-odd-degree.v1"
assert J.verify_group_structure_certificate(certificate)
for coordinates in ((0,0,0), (1,0,0), (0,1,0), (1,1,7), (0,0,4)):
    value = G(coordinates)
    assert phi.preimage(phi(value)) == value
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("genus-three completion memoizes duplicate exact annihilation queries", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.genus3_completion import (
    complete_genus3_lpolynomial,
    enumerate_genus3_weil_candidates,
    jacobian_order_from_coefficients,
)
p = 101
residues = (12, 56, 85)
candidates = enumerate_genus3_weil_candidates(p, residues)["candidates"]
counts = {}
def test_order(order):
    counts[order] = counts.get(order, 0) + 1
    return order % 149 == 0
answer = complete_genus3_lpolynomial(
    p,
    residues,
    jacobian_annihilation_tests=(test_order,),
)
assert answer["status"] == "unique"
assert answer["coefficients"] == (12, 56, 186)
unique_orders = set(jacobian_order_from_coefficients(c, p) for c in candidates)
assert all(count == 1 for count in counts.values())
assert len(counts) <= len(unique_orders)
assert answer["diagnostics"]["annihilation_test_calls"]["jacobian"] == len(counts)
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("prepared genus-three BSGS uses packed progressions and exact factor strip", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.certified_genus3 import (
    _deterministic_elements,
    _prepared_order_certificates,
)
from sagejs.hyperelliptic_curves.group_structure import group_element_key
R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**7 + x + 1).jacobian()
D = _deterministic_elements(J, 5, max_x_values=5, max_elements=1)[0]

class InstrumentedPrepared:
    def __init__(self):
        self.native_available = True
        self.scalar_batches = 0
        self.progression_batches = 0
    def scalar_batch(
        self, elements, scalars, algorithm=None, max_group_operations=None
    ):
        self.scalar_batches += 1
        return tuple(
            element._scalar_multiple_reference(scalar)
            for element, scalar in zip(elements, scalars)
        )
    def progression_batch(
        self, start, step, count, packed=False, max_group_operations=None
    ):
        self.progression_batches += 1
        values = []
        current = start
        for index in range(count):
            values.append(group_element_key(current) if packed else current)
            if index + 1 < count:
                u, v = J._compose(current[0], current[1], step[0], step[1])
                current = J._element(u, v, False)
        return tuple(values)

prepared = InstrumentedPrepared()
def prepared_factory(algorithm="auto", max_batch_items=100000):
    return prepared
J.prepared_arithmetic = prepared_factory

answer = _prepared_order_certificates(
    J,
    D,
    41,
    7,
    5,
    {
        "max_trial_divisions": 1000,
        "max_baby_steps": 1000,
        "max_group_operations": 1000,
    },
)
assert answer["status"] == "found"
assert answer["annihilating_multiple"] == 55
assert answer["certificate"]["element_order"] == 55
assert answer["certificate"]["prime_factors"] == ((5, 1), (11, 1))
assert answer["diagnostics"]["preparedProgressions"] == 2
assert answer["diagnostics"]["packedProgressions"] == 2
assert answer["diagnostics"]["groupOperations"] == 43
assert prepared.progression_batches == 2
assert prepared.scalar_batches == 2
assert (55*D).is_zero() and not (11*D).is_zero() and not (5*D).is_zero()
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

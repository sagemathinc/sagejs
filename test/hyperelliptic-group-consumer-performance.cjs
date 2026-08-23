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
        self.scalar_batches = 0
        self.add_batches = 0
        self.sums = 0
    def scalar_batch(self, elements, scalars, max_group_operations=None):
        self.scalar_batches += 1
        return tuple(
            element.scalar_multiple(scalar, algorithm="reference")
            for element, scalar in zip(elements, scalars)
        )
    def add_batch(self, left, right):
        self.add_batches += 1
        return tuple(a + b for a, b in zip(left, right))
    def sum(self, elements):
        self.sums += 1
        answer = J.zero()
        for element in elements:
            answer += element
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
value = budget.linear_combination((3, 5), (D, 2*D))
assert value == 13*D
assert prepared.scalar_batches == 2
assert prepared.sums == 1

pair = add_pairs_batched((D, 2*D), (3*D, 4*D), algorithm="auto")
assert pair == (4*D, 6*D)
assert prepared.add_batches == 1
assert group_element_key(D) == group_element_key(J(D))
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

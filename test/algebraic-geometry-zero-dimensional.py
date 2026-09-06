# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Exact zero-dimensional radicals and primary decomposition."""

R = PolynomialRing(QQ, names=("x", "y"))
x, y = R.gens()

fat = R.ideal(x**3, y**2)
assert fat.radical().is_equal(R.ideal(x, y))
assert not fat.is_radical()
assert fat.radical().is_radical()
assert fat.primary_decomposition()[0].is_equal(fat)
assert fat.associated_primes()[0].is_equal(R.ideal(x, y))

left = R.ideal((x - 1) ** 2, y)
right = R.ideal(x + 1, y**3)
product = left.intersection(right)
components = product.primary_decomposition()
assert len(components) == 2
assert components[0].intersection(components[1]).is_equal(product)
assert all(component.dimension() == 0 for component in components)
assert product.radical().is_equal(R.ideal(x**2 - 1, y))

# Two nonsplit residue fields remain distinct primary components over QQ.
nonsplit = R.ideal((x**2 + 1) * (x**2 + 2), y - x)
nonsplit_components = nonsplit.primary_decomposition()
assert len(nonsplit_components) == 2
assert nonsplit_components[0].intersection(nonsplit_components[1]).is_equal(nonsplit)
assert len(nonsplit.variety()) == 0

F = GF(3)
S = PolynomialRing(F, names=("u", "v"))
u, v = S.gens()
inseparable = S.ideal(u**3, v**6)
assert inseparable.radical().is_equal(S.ideal(u, v))

finite_product = S.ideal((u**2 + 1) * (u - 1), v - u)
finite_components = finite_product.primary_decomposition()
assert len(finite_components) == 2
assert finite_components[0].intersection(finite_components[1]).is_equal(finite_product)

A = AffineSpace(QQ, 2, names=("a", "b"))
a, b = A.gens()
reduced_components = A.subscheme([(a - 1) ** 2 * (a + 1), b]).irreducible_components()
assert len(reduced_components) == 2
assert all(component.defining_ideal().is_radical() for component in reduced_components)
try:
    A.subscheme([a]).irreducible_components()
    raise AssertionError("positive-dimensional components must be rejected")
except NotImplementedError as error:
    assert "zero-dimensional" in str(error)

# Separator families are lazy. The first finite candidate at the full 65536
# element envelope must not first construct/deduplicate all remaining elements.
from sagejs.polynomial_algorithms import zero_dimensional as zd

binary_ring = PolynomialRing(GF(2), names=("binary_x", "binary_y"))
binary_x, binary_y = binary_ring.gens()
finite_candidates = zd._finite_candidates(
    binary_ring.ideal(binary_x**16, binary_y), "auto", True
)
assert iter(finite_candidates) is finite_candidates
assert next(finite_candidates) == binary_ring(1)

saved_rational = zd._rational_candidates
saved_finite = zd._finite_candidates


def unnecessary_search(*args):
    raise AssertionError("a certified first candidate must stop the search")
    yield None


try:
    zd._rational_candidates = unnecessary_search
    zd._finite_candidates = unnecessary_search
    assert zd._separator_status(R.ideal(x, y), "auto", True)[0] == "field"
finally:
    zd._rational_candidates = saved_rational
    zd._finite_candidates = saved_finite

unit = R.ideal(1)
assert unit.radical().is_one()
assert unit.primary_decomposition() == []

try:
    R.ideal(x).radical()
    raise AssertionError("positive-dimensional radical must be rejected")
except NotImplementedError as error:
    assert "zero-dimensional" in str(error)

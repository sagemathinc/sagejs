# sagejs-test-tier: portable
"""Exact quotient-basis and elementary ideal arithmetic acceptance."""

R = PolynomialRing(GF(101), names=("x", "y"), order="degrevlex")
x, y = R.gens()
I = R.ideal(x**2 - y, y**2 - 1)

assert I.dimension() == 0
assert I.is_zero_dimensional()
assert repr(I.normal_basis()) == "[1, y, x, x*y]"
assert I.vector_space_dimension() == 4
assert I.degree() == 4

zero = R.ideal(0)
unit = R.ideal(1)
assert zero.is_zero() and not zero.is_one()
assert unit.is_one() and not unit.is_zero()
assert zero.dimension() == 2
assert unit.dimension() == -1
assert unit.vector_space_dimension() == 0
assert repr(unit.normal_basis()) == "[]"

positive = R.ideal(x * y)
assert positive.dimension() == 1
assert not positive.is_zero_dimensional()
assert repr(positive.vector_space_dimension()) == "+Infinity"
try:
    positive.normal_basis()
    raise AssertionError("positive-dimensional ideal acquired a finite normal basis")
except ValueError as error:
    assert "zero-dimensional" in str(error)

J = R.ideal(x - y)
K = R.ideal(x + y)
assert J + K == R.ideal(x - y, x + y)
assert J * K == R.ideal(x**2 - y**2)
assert J.is_subset(J + K)
assert J + K >= J
assert not J.is_subset(K)
assert R.ideal(x - y, 2 * x - 2 * y).is_equal(J)

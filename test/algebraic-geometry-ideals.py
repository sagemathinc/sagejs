# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Exact ideal operations and standard-graded Hilbert data."""

R = PolynomialRing(QQ, names=("x", "y", "z"))
x, y, z = R.gens()

I = R.ideal(x)
J = R.ideal(y)
common = I.intersection(J)
assert common.is_equal(R.ideal(x * y))
assert common.is_subset(I)
assert common.is_subset(J)

quotient = R.ideal(x**2, x * y).colon(R.ideal(x))
assert quotient.is_equal(R.ideal(x, y))
multi_quotient = R.ideal(x**2, y**2).colon(R.ideal(x, y))
assert multi_quotient.is_equal(R.ideal(x**2, x * y, y**2))
assert (multi_quotient * R.ideal(x, y)).is_subset(R.ideal(x**2, y**2))

saturated = R.ideal(x * y).saturation(R.ideal(x))
assert saturated.is_equal(R.ideal(y))
assert R.ideal(x * y).saturation(R.ideal(0)).is_one()
assert R.ideal(x * y).colon(R.ideal(0)).is_one()
assert R.ideal(0).intersection(I).is_zero()
assert R.ideal(1).intersection(I).is_equal(I)

zero = R.ideal(0)
zero_data = zero.hilbert_data()
assert zero_data["dimension"] == 3
assert zero_data["degree"] == 1
assert zero.h_vector() == (1,)
t = PolynomialRing(QQ, "t").gen()
assert zero.hilbert_series() == 1 / (1 - t) ** 3
assert zero.hilbert_polynomial() == (t**2 + 3 * t + 2) / 2

plane = R.ideal(x)
assert plane.hilbert_series() == 1 / (1 - t) ** 2
assert plane.hilbert_polynomial() == t + 1
assert plane.degree() == 1

quadric = R.ideal(x**2 + y * z)
assert quadric.h_vector() == (1, 1)
assert quadric.hilbert_series() == (1 + t) / (1 - t) ** 2
assert quadric.hilbert_polynomial() == 2 * t + 1
assert quadric.degree() == 2

complete_intersection = R.ideal(x**2, y**3)
assert complete_intersection.h_vector() == (1, 2, 2, 1)
assert complete_intersection.hilbert_polynomial() == 6
assert complete_intersection.degree() == 6

assert R.ideal(1).hilbert_series() == 0
assert R.ideal(1).degree() == 0
try:
    R.ideal(x + 1).hilbert_series()
    raise AssertionError("nonhomogeneous ideals must not have graded Hilbert data")
except ValueError as error:
    assert "homogeneous" in str(error)

F = GF(5)
S = PolynomialRing(F, names=("a", "b"))
a, b = S.gens()
left = S.ideal(a * (a - 1), b)
right = S.ideal(a, b * (b - 1))
union = left.intersection(right)
left_points = {repr(point) for point in left.variety()}
right_points = {repr(point) for point in right.variety()}
union_points = {repr(point) for point in union.variety()}
assert union_points == left_points.union(right_points)

# A sparse high-degree ideal must not allocate a huge dense numerator first.
from sagejs.polynomial_algorithms.hilbert import _taylor_numerator

assert _taylor_numerator([(2, 0), (0, 3)], 2) == [1, 0, -1, -1, 0, 1]
try:
    _taylor_numerator([(10**12, 0)], 2)
    raise AssertionError("dense Hilbert coefficients must be bounded before allocation")
except OverflowError as error:
    assert "coefficient limit" in str(error)

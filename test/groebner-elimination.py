# sagejs-test-tier: portable
"""Exact elimination through the public ideal API."""

R = PolynomialRing(QQ, names=("x", "y", "z"), order="degrevlex")
x, y, z = R.gens()
I = R.ideal(x * y - 1, y - z)

eliminate_y = I.elimination_ideal(y)
assert eliminate_y.is_equal(R.ideal(x * z - 1), algorithm="buchberger")
assert all(polynomial.degree(y) <= 0 for polynomial in eliminate_y.gens())
assert I.eliminate("y").is_equal(eliminate_y, algorithm="buchberger")
assert I.elimination_ideal([]).is_equal(I, algorithm="buchberger")

S = PolynomialRing(GF(101), names=("a", "b", "c"), order="degrevlex")
a, b, c = S.gens()
J = S.ideal(a - b**2, b - c**2, c**3 - 1)
eliminate_ab = J.elimination_ideal([a, b])
assert eliminate_ab.is_equal(S.ideal(c**3 - 1), algorithm="buchberger")
assert all(
    polynomial.degree(a) <= 0 and polynomial.degree(b) <= 0
    for polynomial in eliminate_ab.gens()
)

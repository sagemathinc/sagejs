"""Distribution smoke: genuine extension coefficients without a source checkout."""

K = GF(9, "a")
a = K.gen()
R = PolynomialRing(K, ["x", "y"])
x, y = R.gens()
I = R.ideal(x - a, y**2)
assert I.normal_form(x**2) == R(a**2)
assert I.vector_space_dimension() == 2
Q = I.quotient_ring()
assert Q(x) == Q(a) and Q(y) ** 2 == 0
assert I.radical(proof=True).is_equal(R.ideal(x - a, y))
A = AffineSpace(K, 2, names=["u", "v"])
u, v = A.gens()
X = A.subscheme([v - a * u])
assert X.dimension() == 1
assert tuple(X(K(1), a)) == (K(1), a)
print("finite-extension distribution checks passed")

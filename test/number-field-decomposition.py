# sagejs-test-tier: portable
# DISABLED: full-runtime qualification fixture
"""Exact decomposition over K, not over its algebraic closure."""

T = PolynomialRing(QQ, "t")
t = T.gen()
K = NumberField(t**2 - 2, "a")
a = K.gen()
R = PolynomialRing(K, ["x", "y"])
x, y = R.gens()
left = R.ideal((x - a) ** 2, y)
right = R.ideal(x + a, y**2)
I = left.intersection(right)
parts = I.primary_decomposition(proof=True)
assert len(parts) == 2
assert parts[0].intersection(parts[1]) == I
assert I.radical() == R.ideal(x**2 - 2, y)
assert I.radical().radical() == I.radical()
assert len(I.variety()) == 2
J = R.ideal(x**2 - 3, y - x)
assert len(J.variety()) == 0
assert J.is_radical()
assert J.primary_decomposition() == [J]
Q = J.quotient_ring()
minimum = Q.minimal_polynomial(Q(x), "z")
assert minimum.parent().base_ring() is K
assert minimum.list() == [K(-3), K(0), K(1)]
print("number-field decomposition passed")

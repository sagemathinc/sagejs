# sagejs-test-tier: portable
# DISABLED: full-runtime fixture run by extension-field-coordinates.cjs
"""Exact canonical coefficient exchange, independent of printed names."""

for order in [9, 16, 32, 125, 1009**2]:
    K = GF(order, "a")
    a = K.gen()
    for value in [K(0), K(1), a, a**2 + a + 1, (a + 1) ** 7]:
        polynomial = value.polynomial()
        assert polynomial.parent().base_ring() is K.prime_subfield()
        assert polynomial.degree() < K.degree()
        reconstructed = K(0)
        for coefficient in reversed(polynomial.coefficients()):
            reconstructed = reconstructed * a + K(coefficient)
        assert reconstructed == value
        renamed = value.polynomial("coefficient_variable")
        assert renamed.parent().variable_name() == "coefficient_variable"
        assert renamed.coefficients() == polynomial.coefficients()

T = PolynomialRing(GF(3), "t")
t = T.gen()
K = GF(9, "nonprimitive", modulus=t**2 + 1)
a = K.gen()
assert (a**2).polynomial() == K.prime_subfield()(2)
assert (2 * a + 1).polynomial().coefficients() == [GF(3)(1), GF(3)(2)]

# Largest 32-bit prime: the common Wasm/native word-characteristic boundary.
# It is 3 modulo 4, so x^2 + 1 is independently known to be irreducible.
p = 4294967291
P = GF(p)
R = PolynomialRing(P, "t")
t = R.gen()
K = GF(p**2, "b", modulus=t**2 + 1)
b = K.gen()
assert (b**2).polynomial() == P(p - 1)
assert (b - 1).polynomial().coefficients() == [P(p - 1), P(1)]

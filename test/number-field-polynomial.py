# sagejs-test-tier: portable
# DISABLED: full-runtime fixture run by number-field-polynomial.cjs
"""Exact polynomial identities over five simple absolute field presentations."""

T = PolynomialRing(QQ, "t")
t = T.gen()
for defining in [t**2 - 2, t**2 + 1, t**3 - 2, t**3 - t - 1, 6 * t**2 + 3 * t - 2]:
    K = NumberField(defining, "a")
    a = K.gen()
    R = PolynomialRing(K, "x")
    x = R.gen()
    f, g = x - a, x + 1
    assert (f * g).quo_rem(f) == (g, R(0))
    assert (f**2 * g).gcd(f * g**2) == f * g
    d, u, v = f.xgcd(g)
    assert d == 1 and u * f + v * g == d
    assert (x**3 + a * x).derivative() == 3 * x**2 + a
    assert f.resultant(g) == a + 1
    assert (f**2 * g**3).squarefree_decomposition().value() == f**2 * g**3
    for order in ["lex", "deglex", "degrevlex"]:
        S = PolynomialRing(K, ["x", "y", "z"], order=order)
        x, y, z = S.gens()
        # SageMath 10.9.post1 exponents(), independently recorded for these
        # three orders. Coefficient arithmetic must not change this ordering.
        expected = {
            "lex": [(2, 0, 0), (1, 0, 1), (0, 2, 0), (0, 0, 3)],
            "deglex": [(0, 0, 3), (2, 0, 0), (1, 0, 1), (0, 2, 0)],
            "degrevlex": [(0, 0, 3), (2, 0, 0), (0, 2, 0), (1, 0, 1)],
        }
        assert [e for c, e in (a * x * z + y**2 + x**2 + z**3).terms()] == expected[
            order
        ]
        h = (x + a * y) ** 2
        assert h == x**2 + 2 * a * x * y + a**2 * y**2
        assert h.derivative(y) == 2 * a * x + 2 * a**2 * y
        assert h.subs(x=y, y=x) == (y + a * x) ** 2
        assert (x + y**2).homogenize(z) == x * z + y**2
        assert h(a, 1, 0) == 4 * a**2
print("number-field polynomial identities passed")

# sagejs-test-tier: portable
# DISABLED: full-runtime fixture run by number-field-polynomial.cjs
"""Exact polynomial identities over five simple absolute field presentations."""

from sagejs.polynomial_algorithms.generic_public import encode, decode


def rejected(action, message=None):
    try:
        action()
    except (ValueError, TypeError, ArithmeticError, NotImplementedError) as error:
        if message is not None:
            assert message in str(error)
        return
    raise AssertionError("invalid polynomial request accepted")


T = PolynomialRing(QQ, "t")
t = T.gen()
for defining in [t**2 - 2, t**2 + 1, t**3 - 2, t**3 - t - 1, 6 * t**2 + 3 * t - 2]:
    K = NumberField(defining, "a")
    a = K.gen()
    R = PolynomialRing(K, "x")
    x = R.gen()
    rejected(lambda: PolynomialRing(K, "a"))
    rejected(lambda: R(K(ZZ(2) ** 4096)), "height")
    rejected(lambda: R._from_terms([(1, (i,)) for i in range(4097)]))
    rejected(lambda: (x**4097).list(), "degree")
    rejected(lambda: R({-1: 1}))
    rejected(lambda: R(1).quo_rem(R(0)))
    rejected(lambda: R(K(ZZ(2) ** 4095)) * 2, "height")
    rejected(lambda: (x**2)(K(ZZ(2) ** 3000)), "height")
    assert R(0).gcd(R(0)) == 0
    assert R(7).resultant(R(3)) == 1
    f, g = x - a, x + 1
    assert (f * g).quo_rem(f) == (g, R(0))
    assert (f**2 * g).gcd(f * g**2) == f * g
    d, u, v = f.xgcd(g)
    assert d == 1 and u * f + v * g == d
    assert (x**3 + a * x).derivative() == 3 * x**2 + a
    assert f.resultant(g) == a + 1
    assert (f**2 * g**3).squarefree_decomposition().value() == f**2 * g**3
    assert decode(R, encode(f)).parent() is R
    assert decode(R, encode(f)) == f
    assert R(f.dict()) == f
    assert f.leading_coefficient() == 1
    assert f.coefficients(sparse=True) == [-a, K(1)]
    rejected(lambda: R(0).squarefree_decomposition())
    rejected(lambda: f.factor())
    rejected(lambda: R(1) / f)
    H = f.homogenize()
    assert H.parent().variable_names() == ("x", "h")
    assert H(1, 1) == f(1)
    packet = encode(f)
    bad = dict(packet)
    bad["terms"] = list(reversed(packet["terms"]))
    rejected(lambda: decode(R, bad))
    other = NumberField(defining, "b")
    receiving = PolynomialRing(other, "x")
    assert decode(receiving, packet).parent() is receiving
    assert encode(decode(receiving, packet)) == packet
    rejected(lambda: R(receiving.gen() + other.gen()))
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
        assert S(h.dict()) == h
        assert h == x**2 + 2 * a * x * y + a**2 * y**2
        assert h.derivative(y) == 2 * a * x + 2 * a**2 * y
        assert h.subs(x=y, y=x) == (y + a * x) ** 2
        assert (x + y**2).homogenize(z) == x * z + y**2
        assert h(a, 1, 0) == 4 * a**2
# Independent nontrivial Euclidean/resultant witness from SageMath 10.9.post1.
K = NumberField(t**3 - t - 1, "a")
a = K.gen()
R = PolynomialRing(K, "x")
x = R.gen()
f, g = x**3 + a * x + 1, x**2 + (a + 1) * x + a
for setting in [True, False]:
    proof.polynomial(setting)
    q, r = f.quo_rem(g)
    assert q.list() == [-a - 1, K(1)]
    assert r.list() == [a**2 + a + 1, a**2 + 2 * a + 1]
    assert f.resultant(g) == a**2 + a + 1
    assert f.gcd(g) == 1
proof.polynomial(True)
print("number-field polynomial identities passed")

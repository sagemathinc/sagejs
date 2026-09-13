"""Public finite-extension polynomial arithmetic and resident-spill regression."""

import sagejs.polynomial_algorithms.extension_mpoly_backend as storage
from sagejs.polynomial_algorithms.generic_groebner import GroebnerResourceError

p = 4294967291
t = PolynomialRing(GF(p), "t").gen()
fields = [
    GF(4, "a"),
    GF(8, "a"),
    GF(9, "b"),
    GF(27, "b"),
    GF(25, "c"),
    GF(65519**2, "d"),
    GF(p**2, "e", modulus=t**2 + 1),
]
for K in fields:
    a = K.gen()
    for order in ["lex", "deglex", "degrevlex"]:
        R = PolynomialRing(K, ["x", "y"], order=order)
        x, y = R.gens()
        f, g = x + a, y + 1
        product = f**3 * g**2
        assert product.gcd(f**2) == f**2
        assert product // f**3 == g**2
        assert f.resultant(x + y, x) == y - a
        assert f.derivative(x) == R(1)
        assert (x + y + a).subs(x=a) == y + 2 * a
        assert product(a, K(1)) == (2 * a) ** 3 * K(2) ** 2
        terms = product.terms()
        assert all(coefficient.parent() is K for coefficient, _ in terms)
        assert R._from_sparse_terms(terms) == product
        factors = product.irreducible_factors()
        assert len(factors) == 2 and f in factors and g in factors
        assert R(a).irreducible_factors() == []
        assert R(0).terms() == []
        assert R(0).univariate_polynomial(x) == 0
        assert R(a).univariate_polynomial(x) == a
        u = (f**3).univariate_polynomial(x)
        assert u.parent().base_ring() is K and u.degree() == 3
        assert u(a) == (2 * a) ** 3
        S = PolynomialRing(K, ["u", "v"], order=order)
        uu, vv = S.gens()
        assert S(product) == (uu + a) ** 3 * (vv + 1) ** 2
        assert R(0).degree() == -1
        assert product.degree(x) == 3 and product.degree(y) == 2
        assert product.number_of_terms() == len(terms)
        assert product.homogenize("z").degree() == 5
        for invalid in [
            lambda: f // g,
            lambda: f // R(0),
            lambda: R._from_sparse_terms([(a, (1048577, 0))]),
        ]:
            try:
                invalid()
            except (ValueError, ZeroDivisionError, GroebnerResourceError):
                pass
            else:
                raise AssertionError("invalid arithmetic accepted")
        assert f * g == g * f  # rejection leaves the parent and operands usable

K = GF(9, "a")
try:
    PolynomialRing(K, ["a", "y"])
except ValueError:
    pass
else:
    raise AssertionError(
        "ambiguous coefficient/coordinate generator collision accepted"
    )

original_values, original_bytes = storage._MAX_VALUES, storage._MAX_BYTES
try:
    for limit in [1, 2, 4]:
        storage._MAX_VALUES = limit
        storage._trim()
        R = PolynomialRing(K, ["x", "y"])
        x, y = R.gens()
        f = (x + K.gen()) ** 2 + y
        g = (x + K.gen()) ** 2 + 1
        # One/both operands must hydrate while already pinned. The cache may
        # transiently exceed its limit only during the synchronous operation.
        product = f * g
        assert product == g * f
        assert product // f == g
        assert product(K.gen(), 1) == f(K.gen(), 1) * g(K.gen(), 1)
        assert storage.cache_status()[0] <= limit
        values = []
        for i in range(8):
            T = PolynomialRing(K, ["x" + str(i), "y" + str(i)])
            xx, yy = T.gens()
            values.append((xx + K.gen()) * (yy + 1))
        for value in values:
            assert value(K.gen(), 1) == 4 * K.gen()
        assert storage.cache_status()[0] <= limit
    storage._MAX_BYTES = 1
    storage._trim()
    assert (f * g).terms() == product.terms()
    assert storage.cache_status() == (0, 0)
finally:
    storage._MAX_VALUES, storage._MAX_BYTES = original_values, original_bytes
    storage._trim()

print("finite-extension public multivariate arithmetic and bounded spill passed")

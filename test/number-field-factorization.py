# sagejs-test-tier: portable
# DISABLED: full-runtime qualification fixture
"""Exact Trager factors require separating norms and full recovery."""

from sagejs.polynomial_algorithms.number_field_factor import factor_with_evidence

T = PolynomialRing(QQ, "t")
t = T.gen()
for index, defining in enumerate(
    [t**2 - 2, t**2 + 1, t**3 - 2, t**3 - t - 1, 6 * t**2 + 3 * t - 2]
):
    if globals().get("_number_field_factor_case") not in (None, index):
        continue
    K = NumberField(defining, "a")
    a = K.gen()
    R = PolynomialRing(K, "x")
    x = R.gen()
    for f in [
        R(7),
        x - a,
        (x - a) ** 3,
        (x - a) * (x + 1),
        (x**2 - 3) * (x - a) ** 2,
        x**2 + a * x + 1,
    ]:
        answer, evidence = factor_with_evidence(f)
        assert answer.value() == f
        assert f.factor().value() == f
        for record in evidence:
            assert record["norm"].gcd(record["norm"].derivative()).degree() == 0
            assert all(g.is_irreducible() for g in record["rational_factors"])
        assert [r["shift"] for r in factor_with_evidence(f)[1]] == [
            r["shift"] for r in evidence
        ]
    print("factorization", defining, "passed")
    try:
        (x ** (64 // int(K.degree()) + 1) + 1).factor()
        raise AssertionError(
            "norm-degree limit must reject, not return a residual factor"
        )
    except ValueError as error:
        assert "norm-degree" in str(error)
    try:
        R(0).factor()
        raise AssertionError("zero cannot be factored")
    except ArithmeticError:
        pass
print("number-field factorization passed")

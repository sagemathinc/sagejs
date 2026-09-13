# sagejs-test-tier: portable

R = PolynomialRing(QQ, names=("x", "y"), order="lex")
x, y = R.gens()
f = QQ(1) / 2 * x**2 + QQ(2) / 3 * y - 1
assert f.terms() == [
    (QQ(1) / 2, (2, 0)),
    (QQ(2) / 3, (0, 1)),
    (-QQ(1), (0, 0)),
]
assert f.monomial_coefficients()[(0, 1)] == QQ(2) / 3

I = R.ideal(x**2 - y, x * y - 1)
G = I.groebner_basis(algorithm="buchberger")
H = R.ideal(x - y**2, y**3 - 1).groebner_basis(algorithm="buchberger")
assert len(G) == len(H) and all(G[index] == H[index] for index in range(len(G)))
assert all(I.normal_form(g, algorithm="buchberger") == 0 for g in I.gens())
metadata = I.groebner_basis_metadata()
assert metadata["backend"] == "python:groebner-reference-with-provenance-v1"
assert metadata["proof"] is True
assert metadata["deterministic"] is True

G_auto_qq = I.groebner_basis()
assert len(G_auto_qq) == len(G) and all(
    G_auto_qq[index] == G[index] for index in range(len(G))
)

S = PolynomialRing(GF(101), names=("a", "b"), order="lex")
a, b = S.gens()
J = S.ideal(a**2 - b, a * b - 1)
G_auto = J.groebner_basis()
G_exact = J.groebner_basis(algorithm="buchberger")
assert len(G_auto) == len(G_exact) and all(
    G_auto[index] == G_exact[index] for index in range(len(G_auto))
)
assert J.groebner_basis_metadata()["backend"].startswith("python:")

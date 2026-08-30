from __future__ import annotations


K = GF(4, "a")
a = K.gen()
R = PolynomialRing(K, names=("x", "y"))
x, y = R.gens()
assert str(R) == (
    "Multivariate Polynomial Ring in x, y over Finite Field in a of size 2^2"
)
assert str((x + a) ** 2 + y) == "x^2 + y + a + 1"
assert str(x + y + a) == "x + y + a"
f = (x + a) ** 2 + y
assert gcd(f * x, f * y) == f
assert R(a + 1) == a + 1

Q = PolynomialRing(QQ, names=("u", "v"))
u, v = Q.gens()
f = (u**3 + 2 * v**2 * u) ** 2
g = u**2 * v**2
I = (f, g) * Q
assert I.ring() is Q
assert len(I.gens()) == 2
assert I.gens()[0] == f
assert I.gens()[1] == g
assert repr(I) == (
    "Ideal (u^6 + 4*u^4*v^2 + 4*u^2*v^4, u^2*v^2) of Multivariate Polynomial\n"
    "Ring in u, v over Rational Field"
)
B = I.groebner_basis()
assert repr(B) == "[u^6, u^2*v^2]"
assert B.universe() is Q
assert len(B) == 2
assert list(B) == [u**6, u**2 * v**2]
assert f in I
assert g in I
assert u**2 not in I

try:
    B.__setitem__(1, u)
    assert False
except ValueError as error:
    assert str(error) == ("object is immutable; please change a copy instead.")

J = Q.ideal(QQ(1, 2) * u + v, u**2)
assert repr(J.groebner_basis()) == "[u + 2*v, v^2]"
assert QQ(1, 2) * u + v in J
assert u not in J

F = GF(65537)
P = PolynomialRing(F, names=("s", "t"), order="degrevlex")
s, t = P.gens()
M = P.ideal(s * t - 1, s**3 + 7 * t**2)
MB = M.groebner_basis()
assert repr(MB) == "[s*t + 65536, t^3 + 18725*s^2, s^3 + 7*t^2]"
assert M.normal_form(s * t - 1) == 0
assert M.reduce(s**3 + 7 * t**2) == 0
assert repr(M.leading_ideal().gens()) == "(s*t, t^3, s^3)"
assert M.groebner_basis_metadata() == {
    "backend": "msolve:f4-prime-field-v1",
    "domain": "GF(p)",
    "characteristic": 65537,
    "order": "degrevlex",
    "proof": False,
    "proof_requested": False,
    "deterministic": True,
    "probabilistic": False,
}

MQ = Q.ideal(u * v - 1, u**3 + 7 * v**2)
MQB = MQ.groebner_basis(algorithm="msolve", proof=False)
assert repr(MQB) == "[u*v - 1, v^3 + 1/7*u^2, u^3 + 7*v^2]"
assert MQ.normal_form(u * v - 1, algorithm="msolve") == 0
assert MQ.groebner_basis_metadata() == {
    "backend": "msolve:modular-qq-v1",
    "domain": "QQ",
    "characteristic": 0,
    "order": "degrevlex",
    "proof": False,
    "proof_requested": False,
    "deterministic": False,
    "probabilistic": True,
}

try:
    MQ.groebner_basis(algorithm="msolve", proof=True)
    assert False
except NotImplementedError as error:
    assert "transformation provenance" in str(error)

assert repr(I.groebner_fan()) == (
    "Groebner fan of the ideal:\n"
    "Ideal (u^6 + 4*u^4*v^2 + 4*u^2*v^4, u^2*v^2) of Multivariate "
    "Polynomial\n"
    "Ring in u, v over Rational Field"
)

A = AffineSpace(2, QQ, "xy")
x, y = A.gens()
C2 = Curve(x**2 + y**2 - 1)
C3 = Curve(x**3 + y**3 - 1)
D = C2 + C3
assert repr(D) == (
    "Affine Plane Curve over Rational Field defined by\n"
    "   x^5 + x^3*y^2 + x^2*y^3 + y^5 - x^3 - y^3 - x^2 - y^2 + 1"
)
assert repr(D.irreducible_components()) == (
    "[Closed subscheme of Affine Space of dimension 2 over Rational Field "
    "defined by:\n"
    "  x^2 + y^2 - 1, "
    "Closed subscheme of Affine Space of dimension 2 over Rational Field "
    "defined by:\n"
    "  x^3 + y^3 - 1]"
)
V = C2.intersection(C3)
assert V.defining_polynomials() == (
    x**2 + y**2 - 1,
    x**3 + y**3 - 1,
)
assert repr(V.irreducible_components()) == (
    "[Closed subscheme of Affine Space of dimension 2 over Rational Field "
    "defined by:\n"
    "  y - 1,\n"
    "  x, "
    "Closed subscheme of Affine Space of dimension 2 over Rational Field "
    "defined by:\n"
    "  x - 1,\n"
    "  y, "
    "Closed subscheme of Affine Space of dimension 2 over Rational Field "
    "defined by:\n"
    "  2*y^2 + 4*y + 3,\n"
    "  x + y + 2]"
)

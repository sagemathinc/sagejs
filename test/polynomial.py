from __future__ import annotations


K = GF(4, 'a')
a = K.gen()
R = PolynomialRing(K, names=('x', 'y'))
x, y = R.gens()
assert str(R) == (
    'Multivariate Polynomial Ring in x, y over '
    'Finite Field in a of size 2^2'
)
assert str((x + a) ** 2 + y) == 'x^2 + y + (a + 1)'
f = (x + a) ** 2 + y
assert gcd(f * x, f * y) == f
assert R(a + 1) == a + 1

Q = PolynomialRing(QQ, names=('u', 'v'))
u, v = Q.gens()
f = (u ** 3 + 2 * v ** 2 * u) ** 2
g = u ** 2 * v ** 2
I = (f, g) * Q
assert I.ring() is Q
assert len(I.gens()) == 2
assert I.gens()[0] == f
assert I.gens()[1] == g
assert repr(I) == (
    'Ideal (u^6 + 4*u^4*v^2 + 4*u^2*v^4, u^2*v^2) of Multivariate Polynomial\n'
    'Ring in u, v over Rational Field'
)
B = I.groebner_basis()
assert repr(B) == '[u^6, u^2*v^2]'
assert B.universe() is Q
assert len(B) == 2
assert list(B) == [u ** 6, u ** 2 * v ** 2]
assert f in I
assert g in I
assert u ** 2 not in I

try:
    B.__setitem__(1, u)
    assert False
except ValueError as error:
    assert str(error) == (
        'object is immutable; please change a copy instead.'
    )

J = Q.ideal(QQ(1, 2) * u + v, u ** 2)
assert repr(J.groebner_basis()) == '[u + 2*v, v^2]'
assert QQ(1, 2) * u + v in J
assert u not in J

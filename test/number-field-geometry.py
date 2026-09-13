# sagejs-test-tier: portable
# DISABLED: full-runtime qualification fixture
"""Geometry equations genuinely involving algebraic coefficients."""

T = PolynomialRing(QQ, "t")
t = T.gen()
K = NumberField(t**2 - 2, "a")
a = K.gen()
A = AffineSpace(K, 2, names=("x", "y"))
x, y = A.gens()
C = A.subscheme([y - a * x**2])
assert C.dimension() == 1
assert C(1, a) in C
assert C.is_smooth()
assert C.singular_subscheme().is_empty()
closure = C.projective_closure("z")
assert closure.dimension() == 1
assert closure.degree() == 2
patch = closure.affine_patch(2)
assert patch.dimension() == 1
P = ProjectiveSpace(K, 2, names=("u", "v", "w"))
u, v, w = P.gens()
assert P(a, 2 * a, 3 * a) == P(1, 2, 3)
D = P.subscheme([u * w - a * v**2])
assert D.is_smooth()
hilbert = D.defining_ideal().hilbert_polynomial()
assert hilbert == 2 * hilbert.parent().gen() + 1
line = AffineSpace(K, 1, names=("s",))
s = line.gen()
parametrization = line.hom([s, a * s**2], A)
assert parametrization(line(a)) == A(a, 2 * a)
assert parametrization.image().defining_ideal() == C.defining_ideal()
assert parametrization.graph().defining_ideal().dimension() == 1
curve = Curve(y**2 - a * x**3)
assert not curve.is_smooth()
assert curve.singular_subscheme().dimension() == 0
print("number-field geometry passed")

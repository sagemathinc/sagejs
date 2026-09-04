# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Deterministic structural checks for the portable geometry layer."""

R = PolynomialRing(QQ, names=("x", "y", "z"))
x, y, z = R.gens()

# Generator order and invertible scaling do not change an ideal.
I = R.ideal(x**2 + y * z, y**2)
J = R.ideal(-3 * y**2, 5 * x**2 + 5 * y * z)
assert I.is_equal(J)
assert I.hilbert_series() == J.hilbert_series()
assert I.hilbert_polynomial() == J.hilbert_polynomial()

# An invertible linear coordinate change preserves the graded invariants.
K = R.ideal((x + y) ** 2 + y * z, y**2)
assert K.dimension() == I.dimension()
assert K.hilbert_series() == I.hilbert_series()
assert K.degree() == I.degree()

# Homogenization/dehomogenization and closure/chart are stated round trips.
S = PolynomialRing(QQ, names=("u", "v"))
u, v = S.gens()
f = v**2 - u**3 - u - 1
h = f.homogenize("w")
assert h.dehomogenize(h.parent().gen(2)) == f
A = AffineSpace(QQ, 2, names=("u", "v"))
X = A.subscheme([v**2 - u**3 - u - 1])
assert (
    X.projective_closure("w")
    .affine_patch(2)
    .defining_ideal()
    .is_equal(X.defining_ideal())
)

# Homogenizing only arbitrary submitted generators would retain a false
# component at infinity; saturation correctly recognizes this affine scheme
# as empty.
empty = A.subscheme([u, u * v - 1])
assert empty.is_empty()
assert empty.projective_closure("w").is_empty()

# The proof preference and a local override both reach the same exact public
# ideal on this bounded case.
saved_proof = proof.polynomial()
try:
    proof.polynomial(False)
    relaxed = R.ideal(x).intersection(R.ideal(y))
    required = R.ideal(x).intersection(R.ideal(y), proof=True)
    assert relaxed.is_equal(required, proof=True)
finally:
    proof.polynomial(saved_proof)

# Scheme union/intersection retain ideal directions and nonreduced structure.
A2 = AffineSpace(QQ, 2, names=("a", "b"))
a, b = A2.gens()
double_axis = A2.subscheme([a**2])
other_axis = A2.subscheme([b])
assert (
    double_axis.intersection(other_axis)
    .defining_ideal()
    .is_equal(A2.coordinate_ring().ideal(a**2, b))
)
assert (
    double_axis.union(other_axis)
    .defining_ideal()
    .is_equal(A2.coordinate_ring().ideal(a**2 * b))
)

# A graph image preserves a nilpotent: the image is a double point, not its
# reduced point set.
A1 = AffineSpace(QQ, 1, names=("t",))
t = A1.gen()
double_point = A1.subscheme([t**2])
target = AffineSpace(QQ, 1, names=("s",))
image = double_point.hom([t], target).image()
s = target.gen()
assert image.defining_ideal().is_equal(target.coordinate_ring().ideal(s**2))

# Supported decompositions are deterministic and radical is idempotent.
T = PolynomialRing(QQ, names=("r", "q"))
r, q = T.gens()
Z = T.ideal((r - 1) ** 2 * (r + 1), q)
first = Z.primary_decomposition()
second = Z.primary_decomposition()
assert [repr(component.groebner_basis()) for component in first] == [
    repr(component.groebner_basis()) for component in second
]
assert Z.radical().radical().is_equal(Z.radical())

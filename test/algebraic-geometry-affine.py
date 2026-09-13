# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Affine spaces, rational points, and structure-preserving subschemes."""

A = AffineSpace(QQ, 2, names=("x", "y"))
assert A is AffineSpace(2, QQ, names=("x", "y"))
assert A.dimension() == 2
assert A.codimension() == 0
x, y = A.gens()

P = A(1, 2)
assert P.coordinates() == (QQ(1), QQ(2))
assert tuple(P) == (QQ(1), QQ(2))
assert P in A
assert hash(P) == hash(A(1, 2))

X = A.subscheme([y - x**2])
assert A(2, 4) in X
assert A(2, 3) not in X
XP = X(2, 4)
assert XP.parent() is X
assert XP in X
assert XP == A(2, 4)
assert hash(XP) == hash(A(2, 4))
assert X.dimension() == 1
assert X.codimension() == 1
Q = X.coordinate_ring()
qx, qy = Q.gens()
assert qy == qx**2
assert X.coordinate_ring(proof=False) is X.coordinate_ring(proof=False)
assert X.coordinate_ring(proof=False) is not X.coordinate_ring(proof=True)

reduced = A.subscheme([x])
nonreduced = A.subscheme([x**2])
assert reduced != nonreduced
assert reduced.is_subscheme(nonreduced)
assert not nonreduced.is_subscheme(reduced)

horizontal = A.subscheme([y])
crossing = reduced.union(horizontal)
origin = reduced.intersection(horizontal)
assert crossing.defining_ideal().is_equal(A.coordinate_ring().ideal(x * y))
assert origin.defining_ideal().is_equal(A.coordinate_ring().ideal(x, y))
assert origin.is_subscheme(reduced)
assert origin.is_subscheme(horizontal)

empty = A.subscheme([1])
assert empty.is_empty()
assert empty.dimension() == -1

F = GF(3)
B = AffineSpace(F, 2, names=("u", "v"))
u, v = B.gens()
C = B.subscheme([v - u**2])
assert len(B.rational_points()) == 9
assert len(C.rational_points()) == 3
assert all(point in C for point in C.rational_points())

extension_space = AffineSpace(GF(4, "a"), 2)
assert extension_space.dimension() == 2
assert len(extension_space.rational_points()) == 16

K = NumberField(PolynomialRing(QQ, "w").gen() ** 2 + 1, "i")
try:
    AffineSpace(K, 1)
    raise AssertionError("number fields are outside this milestone")
except NotImplementedError as error:
    assert "exact coefficient adapter" in str(error)
    assert "operation=geometry" in str(error)

try:
    AffineSpace(True, QQ)
    raise AssertionError("boolean dimensions must not be guessed")
except TypeError:
    pass

try:
    AffineSpace(QQ, 0)
    raise AssertionError("zero-variable coordinate rings are not implemented")
except NotImplementedError as error:
    assert "zero-variable polynomial-ring" in str(error)

# Constructing unrelated spaces must not evict a live mathematical parent.
live_affine = AffineSpace(QQ, 2, names=("live_x", "live_y"))
live_projective = ProjectiveSpace(QQ, 2, names=("live_r", "live_s", "live_t"))
affine_point = live_affine(1, 2)
projective_point = live_projective(1, 2, 3)
for index in range(140):
    AffineSpace(QQ, 2, names=("other_x" + str(index), "other_y" + str(index)))
    ProjectiveSpace(
        QQ,
        2,
        names=("other_r" + str(index), "other_s" + str(index), "other_t" + str(index)),
    )
assert AffineSpace(QQ, 2, names=("live_x", "live_y")) is live_affine
assert ProjectiveSpace(QQ, 2, names=("live_r", "live_s", "live_t")) is live_projective
assert affine_point == AffineSpace(QQ, 2, names=("live_x", "live_y"))(1, 2)
assert projective_point == ProjectiveSpace(QQ, 2, names=("live_r", "live_s", "live_t"))(
    1, 2, 3
)

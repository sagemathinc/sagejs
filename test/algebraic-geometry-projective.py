# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Projective points, saturated schemes, affine charts, and closures."""

P2 = ProjectiveSpace(QQ, 2, names=("x", "y", "z"))
assert P2 is ProjectiveSpace(2, QQ, names=("x", "y", "z"))
x, y, z = P2.gens()
assert P2(2, 4, 6) == P2(1, 2, 3)

try:
    P2(0, 0, 0)
    raise AssertionError("the zero tuple is not projective")
except ValueError:
    pass

try:
    P2.subscheme([x + 1])
    raise AssertionError("projective equations must be homogeneous")
except ValueError as error:
    assert "homogeneous" in str(error)

C = P2.subscheme([y**2 * z - x**3 - x * z**2])
assert C.dimension() == 1
assert C.codimension() == 1
assert C.degree() == 3
assert P2(0, 0, 1) in C
assert P2(0, 1, 0) in C

patch = C.affine_patch(2)
px, py = patch.ambient_space().gens()
assert patch.defining_ideal().is_equal(
    patch.ambient_space().coordinate_ring().ideal(py**2 - px**3 - px)
)

# These submitted ideals differ, but define the same Proj after irrelevant
# saturation.
line = P2.subscheme([x])
line_with_irrelevant_component = P2.subscheme([x**2, x * y, x * z])
assert line.is_equal(line_with_irrelevant_component)

A2 = AffineSpace(QQ, 2, names=("u", "v"))
u, v = A2.gens()
parabola = A2.subscheme([v - u**2])
closure = parabola.projective_closure("w")
cu, cv, w = closure.ambient_space().gens()
assert closure.defining_ideal().is_equal(
    closure.ambient_space()
    .coordinate_ring()
    .ideal(cv * w - cu**2)
    .saturation(closure.ambient_space().irrelevant_ideal())
)
round_trip = closure.affine_patch(2)
ru, rv = round_trip.ambient_space().gens()
assert round_trip.defining_ideal().is_equal(
    round_trip.ambient_space().coordinate_ring().ideal(rv - ru**2)
)

F = GF(3)
P1 = ProjectiveSpace(F, 1, names=("s", "t"))
assert len(P1.rational_points()) == 4
assert len({repr(point) for point in P1.rational_points()}) == 4

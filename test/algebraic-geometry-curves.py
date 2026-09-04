# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Affine and projective plane-curve conveniences."""

A2 = AffineSpace(QQ, 2, names=("x", "y"))
x, y = A2.gens()
cusp = Curve(y**2 - x**3)
assert cusp.degree() == 3
assert cusp.defining_polynomial() == y**2 - x**3
assert not cusp.is_smooth(cusp(0, 0))
closure = cusp.projective_closure("z")
cx, cy, z = closure.ambient_space().gens()
assert closure.defining_ideal().is_equal(
    closure.ambient_space()
    .coordinate_ring()
    .ideal(cy**2 * z - cx**3)
    .saturation(closure.ambient_space().irrelevant_ideal())
)
assert closure.arithmetic_genus() == 1
assert closure.affine_patch(2).defining_ideal().is_equal(cusp.defining_ideal())

P2 = ProjectiveSpace(QQ, 2, names=("r", "s", "t"))
r, s, t = P2.gens()
conic = Curve(r * t - s**2)
assert conic.degree() == 2
assert conic.arithmetic_genus() == 0
point = conic(1, 0, 0)
line = conic.tangent_line(point)
assert line.defining_ideal().is_equal(P2.coordinate_ring().ideal(t))

doubled = Curve(r**2)
assert doubled.arithmetic_genus() == 0
assert not doubled.is_smooth(doubled(0, 1, 0))

F = GF(5)
B2 = AffineSpace(F, 2, names=("u", "v"))
u, v = B2.gens()
nodal = Curve(v**2 - u**2 * (u + 1))
assert B2(0, 0) in nodal.singular_points()

parabola = Curve(y - x**2)
nonorigin_tangent = parabola.tangent_line(parabola(1, 1))
assert nonorigin_tangent.defining_ideal().is_equal(
    A2.coordinate_ring().ideal(-2 * x + y + 1)
)

try:
    cusp.geometric_genus()
    raise AssertionError("geometric genus must not be guessed")
except NotImplementedError as error:
    assert "normalization" in str(error)

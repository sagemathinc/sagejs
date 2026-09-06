# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Polynomial maps, graphs, fibers, inverse images, and exact images."""

A1 = AffineSpace(QQ, 1, names=("t",))
t = A1.gen()
A2 = AffineSpace(QQ, 2, names=("x", "y"))
x, y = A2.gens()

parametrization = A1.hom([t, t**2], A2)
assert parametrization(A1(3)) == A2(3, 9)
image = parametrization.image()
assert image.defining_ideal().is_equal(A2.coordinate_ring().ideal(y - x**2))

projection = A2.hom([x], A1)
assert projection.compose(parametrization)(A1(5)) == A1(5)
assert projection.compose(parametrization).is_equal(A1.hom([t], A1))
identity = A1.hom([t], A1)
constant = A1.hom([2], A1)
assert identity(A1(7)) == A1(7)
assert constant(A1(7)) == A1(2)

fiber = projection.fiber(A1(2))
assert fiber.defining_ideal().is_equal(A2.coordinate_ring().ideal(x - 2))
axis = A1.subscheme([t])
inverse = projection.inverse_image(axis)
assert inverse.defining_ideal().is_equal(A2.coordinate_ring().ideal(x))

graph = parametrization.graph()
assert graph.coordinate_ring().ngens() == 3
assert graph.defining_ideal().dimension() == 1

# User names that resemble graph temporaries cannot collide with the private
# elimination block.
collision_source = AffineSpace(QQ, 1, names=("source_x",))
source_x = collision_source.gen()
collision_target = AffineSpace(QQ, 1, names=("target_x",))
collision_graph = collision_source.hom([source_x], collision_target).graph()
assert len(set(collision_graph.coordinate_ring().variable_names())) == 2

parabola = A2.subscheme([y - x**2])
inclusion = parabola.hom([x, y], A2)
assert inclusion(parabola(2, 4)) == A2(2, 4)
try:
    A1.hom([t, t + 1], parabola)
    raise AssertionError("codomain equations must be validated")
except ValueError as error:
    assert "codomain" in str(error)

P1 = ProjectiveSpace(QQ, 1, names=("s", "u"))
s, u = P1.gens()
P2 = ProjectiveSpace(QQ, 2, names=("a", "b", "c"))
a, b, c = P2.gens()
veronese = P1.hom([s**2, s * u, u**2], P2)
assert veronese(P1(1, 2)) == P2(1, 2, 4)
conic = veronese.image()
assert conic.defining_ideal().is_equal(
    P2.coordinate_ring().ideal(b**2 - a * c).saturation(P2.irrelevant_ideal())
)

try:
    P1.hom([s**2, s * u], P1)
    raise AssertionError("projective base points must be rejected")
except ValueError as error:
    assert "base point" in str(error)

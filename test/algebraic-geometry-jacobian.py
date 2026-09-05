# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Jacobians, tangent spaces, smoothness, and singular schemes."""

A2 = AffineSpace(QQ, 2, names=("x", "y"))
x, y = A2.gens()
assert A2.is_smooth(A2(1, 2))
assert A2.is_smooth()
parabola = A2.subscheme([y - x**2])
P = parabola(1, 1)
J = parabola.jacobian_matrix()
assert J.nrows() == 1 and J.ncols() == 2
assert J[0, 0] == -2 * x and J[0, 1] == 1
T = parabola.tangent_space(P)
assert T.dimension() == 1
assert T.equations() == (-2 * x + y,)
assert parabola.is_smooth(P)
assert parabola.is_smooth()
assert parabola.singular_subscheme().is_empty()

cusp = A2.subscheme([y**2 - x**3])
origin = cusp(0, 0)
assert cusp.tangent_space(origin).dimension() == 2
assert not cusp.is_smooth(origin)
assert not cusp.is_smooth()
assert origin in cusp.singular_subscheme()

double_line = A2.subscheme([x**2])
assert not double_line.is_smooth(double_line(0, 2))
assert (
    double_line.singular_subscheme()
    .defining_ideal()
    .is_equal(A2.coordinate_ring().ideal(x))
)

F = GF(3)
B2 = AffineSpace(F, 2, names=("u", "v"))
u, v = B2.gens()
inseparable = B2.subscheme([u**3 + v**3])
assert inseparable.jacobian_matrix().list() == [B2.coordinate_ring()(0)] * 2
assert not inseparable.is_smooth(inseparable(1, 2))

A3 = AffineSpace(QQ, 3, names=("a", "b", "c"))
a, b, c = A3.gens()
mixed = A3.subscheme([a * b, a * c])
try:
    mixed.singular_subscheme()
    raise AssertionError("mixed-dimensional Jacobian minors must be refused")
except NotImplementedError as error:
    assert "mixed-dimensional" in str(error)

P2 = ProjectiveSpace(QQ, 2, names=("r", "s", "t"))
r, s, t = P2.gens()
assert P2.is_smooth(P2(1, 0, 0))
assert P2.is_smooth()
conic = P2.subscheme([r * t - s**2])
assert conic.tangent_space(conic(1, 0, 0)).dimension() == 1
assert conic.is_smooth()

# Polynomial minors agree with the independent exact integer matrix backend,
# including sign changes from row reversal and the largest admitted order.
from sagejs.schemes.jacobian import _determinant

state = 17
for size in range(1, 9):
    values = []
    for _index in range(size * size):
        state = (1103515245 * state + 12345) % 2147483648
        values.append(state % 19 - 9)
    integer_matrix = matrix(ZZ, size, size, values)
    rows = [
        [A2.coordinate_ring()(value) for value in row] for row in integer_matrix.rows()
    ]
    expected = A2.coordinate_ring()(integer_matrix.det())
    assert _determinant(rows) == expected
    assert (
        _determinant(list(reversed(rows)))
        == (-1) ** (size * (size - 1) // 2) * expected
    )


class CountedRingElement:
    multiplications = 0

    def __init__(self, value):
        self.value = value

    def parent(self):
        return CountedRingElement

    def __mul__(self, other):
        CountedRingElement.multiplications += 1
        return CountedRingElement(self.value * other.value)

    def __add__(self, other):
        return CountedRingElement(self.value + other.value)

    def __sub__(self, other):
        return CountedRingElement(self.value - other.value)


counted = [[CountedRingElement(int(i == j)) for j in range(8)] for i in range(8)]
assert _determinant(counted).value == 1
assert CountedRingElement.multiplications == 8 * 2**7

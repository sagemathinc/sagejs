# sagejs-test-tier: portable
# DISABLED: full-runtime lazy-package fixture, run by algebraic-geometry.cjs
"""Polynomial calculus and canonical quotient-ring acceptance."""

R = PolynomialRing(QQ, names=("x", "y"))
x, y = R.gens()
f = x**3 + 2 * x * y + y**2 + 7

assert f(2, 3) == 36
assert f([2, 3]) == 36
assert f(x=2, y=3) == 36
assert f.subs({"x": y, "y": x}) == y**3 + 2 * x * y + x**2 + 7
assert f.subs({"x": y}) == y**3 + 2 * y**2 + y**2 + 7
assert f.derivative(x) == 3 * x**2 + 2 * y
assert f.derivative(y) == 2 * x + 2 * y
assert f.derivative(x, 2) == 6 * x
assert f.gradient() == (3 * x**2 + 2 * y, 2 * x + 2 * y)
assert not f.is_homogeneous()
assert (x**2 + x * y + y**2).is_homogeneous()

h = f.homogenize("z")
S = h.parent()
sx, sy, z = S.gens()
assert h == sx**3 + 2 * sx * sy * z + sy**2 * z + 7 * z**3
assert h.is_homogeneous()
assert h.dehomogenize(z) == f

Fp = GF(3)
T = PolynomialRing(Fp, names=("u", "v"))
u, v = T.gens()
assert (u**3 + u * v).derivative(u) == v

I = R.ideal(x**2 - y, y**2 - 1)
Q = I.quotient_ring()
qx, qy = Q.gens()
assert qx**2 == qy
assert qy**2 == 1
assert Q(x**4) == 1
assert Q.lift(qx * qy) == x * y
assert Q.vector_space_dimension() == 4
assert Q.basis() == (Q(1), Q(y), Q(x), Q(x * y))
assert Q.coordinates(qx * qy + 2) == (QQ(2), QQ(0), QQ(0), QQ(1))
assert Q.multiplication_matrix(qx).nrows() == 4
assert Q.minpoly(qy) == PolynomialRing(QQ, "t")([-1, 0, 1])
assert qx * qy + 2 == Q(x * y + 2)

# A second quotient of the same cover ring must neither create an ambiguous
# common parent nor change ordinary polynomial/scalar arithmetic.
Q2 = R.ideal(x, y).quotient_ring()
assert Q2(x + 1) == 1
assert x + 1 == R(x + 1)
try:
    qx + Q2(x)
    raise AssertionError("different quotient parents must not coerce")
except TypeError:
    pass

positive = R.ideal(x * y).quotient_ring()
try:
    positive.basis()
    raise AssertionError("positive-dimensional quotient acquired a finite basis")
except ValueError as error:
    assert "zero-dimensional" in str(error)

assert (x**2 + y).derivative(x, 10**12) == 0
assert R(0).derivative(x, 10**12) == 0

# Equality may reject coercion, but cannot conceal a failed exact reduction.
saved_reduce = Q._reduce


def broken_reduce(representative):
    raise ArithmeticError("deliberate exact reduction failure")


try:
    Q._reduce = broken_reduce
    try:
        qx == x
        raise AssertionError("equality concealed an arithmetic failure")
    except ArithmeticError as error:
        assert "deliberate exact reduction failure" in str(error)
finally:
    Q._reduce = saved_reduce

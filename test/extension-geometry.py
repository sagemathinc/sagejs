"""Core scheme operations over genuine extension coefficients."""

assert globals().get("_extension_field_selection") in (None, 4, 9, 27)

for q in [4, 9, 27]:
    if globals().get("_extension_field_selection") not in (None, q):
        continue
    K = GF(q, "a")
    a = K.gen()
    q = int(K.cardinality())
    A = AffineSpace(K, 2, names=("x", "y"))
    x, y = A.gens()
    R = A.coordinate_ring()
    assert A is AffineSpace(2, K, names=("x", "y"))
    assert A(a, a + 1) in A
    assert len(A.rational_points(max_points=q**2)) == q**2
    assert len({repr(point) for point in A.rational_points(max_points=q**2)}) == q**2
    try:
        A.rational_points(max_points=q**2 - 1)
    except OverflowError:
        pass
    else:
        raise AssertionError("point limit used p instead of p^d")
    parabola = A.subscheme([y - x**2 - a])
    P = parabola(a, a**2 + a)
    assert parabola.dimension() == 1
    assert parabola.codimension() == 1
    vertical = A.subscheme([x - a])
    horizontal = A.subscheme([y - a])
    assert (
        vertical.intersection(horizontal)
        .defining_ideal()
        .is_equal(R.ideal(x - a, y - a))
    )
    assert (
        vertical.union(horizontal).defining_ideal().is_equal(R.ideal((x - a) * (y - a)))
    )
    assert parabola.tangent_space(P).dimension() == 1
    assert parabola.is_smooth(P) and parabola.is_smooth()
    assert parabola.singular_subscheme().is_empty()
    B = AffineSpace(K, 1, names=("t",))
    t = B.gen()
    parametrization = B.hom([t, t**2 + a], A)
    assert parametrization(B(a)) == A(a, a**2 + a)
    assert parametrization.image().defining_ideal().is_equal(parabola.defining_ideal())
    projection = A.hom([x], B)
    assert projection.compose(parametrization).is_equal(B.hom([t], B))
    assert projection.fiber(B(a)).defining_ideal().is_equal(R.ideal(x - a))
    assert (
        projection.inverse_image(B.subscheme([t - a]))
        .defining_ideal()
        .is_equal(R.ideal(x - a))
    )
    assert parametrization.graph().defining_ideal().dimension() == 1
    closure = parabola.projective_closure("h")
    assert closure.degree() == 2
    patch = closure.affine_patch(2)
    px, py = patch.ambient_space().gens()
    assert patch.defining_ideal().is_equal(
        patch.ambient_space().coordinate_ring().ideal(py - px**2 - a)
    )
    P1 = ProjectiveSpace(K, 1, names=("s", "u"))
    assert len(P1.rational_points(max_points=q + 1)) == q + 1
    assert len({repr(point) for point in P1.rational_points()}) == q + 1
    for scalar in K:
        if scalar:
            assert P1(scalar * a, scalar) == P1(a, 1)
            assert hash(P1(scalar * a, scalar)) == hash(P1(a, 1))
    s, u = P1.gens()
    automorphism = P1.hom([a * s, u], P1)
    assert automorphism(P1(1, 1)) == P1(a, 1)
    P2 = ProjectiveSpace(K, 2, names=("r", "s", "t"))
    r, s, u = P2.gens()
    conic = Curve(r * u - a * s**2)
    assert conic.degree() == 2 and conic.arithmetic_genus() == 0
    assert conic.codimension() == 1
    hilbert = conic.defining_ideal().hilbert_polynomial()
    assert hilbert == 2 * hilbert.parent().gen() + 1
    assert conic.is_smooth(conic(1, 0, 0))
    assert (
        conic.tangent_line(conic(1, 0, 0))
        .defining_ideal()
        .is_equal(P2.coordinate_ring().ideal(u))
    )
    p = int(K.characteristic())
    thick = A.subscheme([x**p - a])
    b = a ** (q // p)
    assert thick.jacobian_matrix().list() == [R(0), R(0)]
    assert not thick.is_smooth(thick(b, 0))
    assert thick.tangent_space(thick(b, 0)).dimension() == 2
    assert R.ideal((x - a) * y).saturation(R.ideal(x - a)).is_equal(R.ideal(y))
    assert (
        R.ideal((x - a) ** 2, (x - a) * y)
        .colon(R.ideal(x - a))
        .is_equal(R.ideal(x - a, y))
    )
    assert R.ideal(x**2, y**3).degree() == 6
    assert R.ideal(x**2, y**3).h_vector() == (1, 2, 2, 1)

for ambient in [
    AffineSpace(GF(65519**2, "a"), 2),
    ProjectiveSpace(GF(65519**2, "a"), 2),
]:
    try:
        ambient.rational_points()
    except OverflowError:
        pass
    else:
        raise AssertionError("huge finite-field point search was not rejected")

print(
    "finite-extension affine, projective, morphism, curve, and Jacobian checks passed"
)

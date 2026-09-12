"""Shared native/browser public-API corpus for integral morphism geometry."""

J = J0(11)
# Packed rational numerators are a word buffer, not a Python entry list.
integral_rationals = matrix(QQ, [[2**90, 0], [0, 3]])
assert integral_rationals.change_ring(ZZ).change_ring(QQ) == integral_rationals
try:
    (integral_rationals / 2).change_ring(ZZ)
    raise AssertionError("nonintegral rational matrix coerced to integers")
except TypeError:
    pass
identity = J.identity_morphism()
double = J.multiplication_by(2)
assert double.is_surjective() and not double.is_injective()
assert double.is_homology_injective() and not double.is_homology_surjective()
assert double.is_isogeny() and double.degree() == 4
assert double.component_group().invariants() == (2, 2)
assert double.kernel()[1].dimension() == 0
assert double.image().dimension() == 1
assert not double.image_lattice().is_saturated()
assert double.image_lattice() != double.saturated_image_lattice()
assert double.image_lattice() is double.image_lattice()
assert double.saturated_image_lattice() is double.saturated_image_lattice()
assert double.kernel_lattice() is double.kernel_lattice()
assert double.saturated_image_lattice().is_saturated()
assert double([1, 2]) == vector(ZZ, [2, 4])
assert not double.image_lattice().contains([1, 0])
assert double.image_lattice().coordinates([2, 4]) == vector(ZZ, [1, 2])
assert (double - identity) == identity
assert double**3 == J.multiplication_by(8)
assert double.verify()
assert J.hom(double.matrix()) == double
assert J.hom(identity.matrix(), generators=[double]) == identity

P = J * J
i0, i1 = P.injection(0), P.injection(1)
p0, p1 = P.projection(0), P.projection(1)
assert p0 * i0 == identity and p0 * i1 == J.zero_morphism()
assert i0 * p0 + i1 * p1 == P.identity_morphism()
diagonal = i0 + i1
assert diagonal.is_injective()
assert diagonal.image().dimension() == 1
assert (p0 + p1).kernel()[1].dimension() == 1
assert (p0 + p1).component_group().is_trivial()
assert (p0 + p1)([1, 2, 3, 4]) == vector(ZZ, [4, 6])
phi = 2 * p0
assert phi.is_surjective() and phi.connected_kernel().dimension() == 1
assert phi.component_group().invariants() == (2, 2)
assert phi.verify()
assert P.free_module() == P.lattice()
assert phi.connected_kernel().free_module() == phi.connected_kernel().lattice()
assert phi.connected_kernel().serialization_certificate().verify()
assert (diagonal * J.multiplication_by(-3)).component_group().invariants() == (3, 3)
assert (identity**100).verify()
try:
    phi.degree()
    raise AssertionError("positive-dimensional kernel admitted as isogeny")
except ValueError:
    pass
try:
    phi.image_lattice().basis_matrix()[0, 0] = 7
    raise AssertionError("cached homology lattice basis was mutable")
except ValueError:
    pass
try:
    J.hom(identity.matrix().change_ring(QQ) / 2, generators=[identity])
    raise AssertionError("nonintegral homology map admitted")
except ArithmeticError:
    pass
try:
    double.matrix()[0, 0] = 7
    raise AssertionError("certified map matrix was mutable")
except ValueError:
    pass
corrupt = J.multiplication_by(3)
corrupt._recipe = ("identity",)
assert not corrupt.verify()
try:
    J.hom(corrupt.matrix(), generators=[corrupt])
    raise AssertionError("invalid generator certificate admitted")
except ValueError:
    pass
cyclic = J.multiplication_by(3)
cyclic._recipe = ("sum", cyclic, identity)
try:
    cyclic.verify()
    raise AssertionError("cyclic certificate accepted")
except ValueError:
    pass
try:
    J.hom(matrix(ZZ, [[1, 0], [0, 0]]))
    raise AssertionError("arbitrary integral matrix certified as a morphism")
except ValueError:
    pass
T = J0(37).hecke_morphism(2)
assert T.rank() == 2 and T.connected_kernel().dimension() == 1
assert T.component_group().order() >= 1
assert T.image().inclusion_map().verify()

for low, high in [(11, 22), (11, 33), (11, 44), (11, 121)]:
    for d in divisors(high // low):
        up = J0(low).degeneracy_map(high, d)
        down = J0(high).degeneracy_map(low, d)
        covering = Gamma0(high).index() // Gamma0(low).index()
        assert down * up == J0(low).multiplication_by(covering), (low, high, d)
        assert up.verify(5) and down.verify(5)
# Exact Sage 10.9.post1 cross-compositions in the elliptic source: these
# scalar matrices are basis-independent and check more than diagonal degrees.
cross_pairings = {
    22: [[3, -2], [-2, 3]],
    33: [[4, -1], [-1, 4]],
    44: [[6, -4, 1], [-4, 6, -4], [1, -4, 6]],
    121: [[11, 1], [1, 11]],
}
for N, pairing in cross_pairings.items():
    indices = divisors(N // 11)
    for i, d in enumerate(indices):
        for j, e in enumerate(indices):
            cross = J0(N).degeneracy_map(11, d) * J.degeneracy_map(N, e)
            assert cross == J.multiplication_by(pairing[i][j])
for M, ell in [(37, 2), (43, 3)]:
    A = J0(M)
    N = M * ell
    for d in [1, ell]:
        up_large = A.degeneracy_map(N, d)
        down_large = J0(N).degeneracy_map(M, d)
        assert down_large * up_large == A.multiplication_by(ell + 1)
    assert J0(N).degeneracy_map(M, 1) * A.degeneracy_map(N, ell) == A.hecke_morphism(
        ell
    )
for N in [22, 33, 44]:
    decomposition = J0(N).oldform_decomposition()
    assert sum(c.dimension() for c in decomposition) == J0(N).dimension()
    assert decomposition.isogeny().is_isogeny()
    assert decomposition.isogeny().verify()
    labels = [(c.source_level(), c.degeneracy_index()) for c in decomposition]
    assert (11, 1) in labels and (11, N // 11) in labels
old_copy = J0(22).oldform_decomposition()[0].variety()
assert old_copy.inclusion_map().verify(5)
try:
    old_copy.hecke_matrix(2)
    raise AssertionError("an individual old copy was incorrectly made U2-stable")
except ValueError:
    pass

Z = J**0
assert Z.dimension() == 0 and Z.identity_morphism().degree() == 1
assert J0(1).oldform_decomposition().isogeny().degree() == 1
assert J.zero_morphism().kernel()[1].dimension() == 1
assert J.zero_morphism().component_group().invariants() == ()
# Invariant-only native SNF and the transformed portable path must agree,
# including rectangular/zero matrices and coefficients beyond machine integers.
for A in [
    matrix(ZZ, 0, 3),
    matrix(ZZ, 3, 0),
    matrix(ZZ, 3, 4),
    matrix(ZZ, [[2, 4, 6], [0, -12, 3]]),
    matrix(ZZ, [[2**90, 0], [0, 3 * 2**90], [0, 0]]),
]:
    smith_diagonal = A.smith_form()[0].diagonal()
    assert A.elementary_divisors() == smith_diagonal + [0] * (
        A.nrows() - len(smith_diagonal)
    )
for item in [
    double,
    J.hom(identity.matrix(), generators=[double]),
    P,
    diagonal,
    phi,
    diagonal.image(),
    phi.connected_kernel(),
    phi.component_group(),
    up,
    decomposition.isogeny(),
]:
    restored = loads(dumps(item))
    assert restored == item
    if hasattr(restored, "verify"):
        assert restored.verify()
print("integral morphism geometry passed")

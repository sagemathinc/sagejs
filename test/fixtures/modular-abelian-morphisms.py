"""Shared native/browser public-API corpus for integral morphism geometry."""

J = J0(11)
from sagejs.modular_abelian_varieties.lattices import (
    _clear_denominators,
    _saturated_integer_intersection,
)

# The column-lattice dual algorithm agrees with the independent double-kernel
# construction, including coupled denominators and dependent generators.
for rows in range(6):
    for columns in range(1, 9):
        B = matrix(
            QQ,
            rows,
            columns,
            [
                QQ(((i + 2) * (j + 3) + i * i * j) % 13 - 6) / (j % 3 + 1)
                for i in range(rows)
                for j in range(columns)
            ],
        )
        equations, denominator = _clear_denominators(B.right_kernel_matrix())
        reference = equations.right_kernel_matrix().hermite_form(
            include_zero_rows=False
        )
        actual = _saturated_integer_intersection(B)
        assert actual == reference, (rows, columns)
        assert _saturated_integer_intersection(actual) == actual
coupled = matrix(QQ, [[1, 0, 1 / 2], [0, 1, 1 / 2]])
assert _saturated_integer_intersection(coupled) == matrix(ZZ, [[1, 1, 1], [0, 2, 1]])

# Independently reduce translated paths instead of counting projective
# generators. Level 11 also exercises the public change of E1 basis.
from sagejs.modular_abelian_varieties.degeneracy import _lift, _multiply, _transfer

for M, N in [(11, 22), (37, 74)]:
    source, target = ModularSymbols(M), ModularSymbols(N)
    lifts = [_lift(c, d, M) for c, d in source.p1list().list()]
    source_rows = matrix(
        QQ, [source.modular_symbol((g[1], g[3]), (g[0], g[2])).vector() for g in lifts]
    )
    pivots = list(source_rows.transpose().pivots())
    cosets = [_lift(c, d, N) for c, d in target.p1list().list() if c % M == 0]
    images = []
    for i in pivots:
        image = vector(QQ, [0] * target.dimension())
        for h in cosets:
            a, b, c, d = _multiply(h, lifts[i])
            image += target.modular_symbol((b, d), (a, c)).vector()
        images.append(image)
    expected = source_rows.matrix_from_rows(pivots).solve_right(matrix(QQ, images))
    assert _transfer(source, target) == expected

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
assert sum([i0, i1], J.zero_morphism(P)) == diagonal
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

# This formerly exceeded two minutes in Wasm in portable integral rank and
# transformed Smith. Pin the geometric answer from Sage, not timing.
large_hecke = J0(389).hecke_morphism(2) - 1
assert large_hecke.rank() == 64
assert large_hecke.component_group().invariants() == (2,) * 8 + (30, 30)

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
    explicit = decomposition.isogeny().domain().zero_morphism(J0(N))
    for i, item in enumerate(decomposition):
        explicit += (
            item.variety().inclusion_map()
            * decomposition.isogeny().domain().projection(i)
        )
    assert decomposition.isogeny() == explicit
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

# Modular-HNF preconditioning preserves all invariants, not only determinant.
from sagejs.linear_algebra.integer_smith import (
    _modular_hnf,
    preconditioned_elementary_divisors,
)

for n in [16, 19]:
    for scale in [1, 6, 2**90]:
        D = diagonal_matrix(ZZ, [scale * (i + 1) for i in range(n)])
        U = identity_matrix(ZZ, n)
        V = identity_matrix(ZZ, n)
        for i in range(n - 1):
            for j in range(i + 1, n):
                U[i, j] = (-1) ** i * (i + j + 7)
                V[j, i] = i + j + 3
        A = U * D * V
        bound = scale
        for i in range(1, n + 1):
            bound *= i
        assert _modular_hnf(A, bound) == A.hermite_form()
        assert preconditioned_elementary_divisors(A) == D.elementary_divisors()
        assert (
            preconditioned_elementary_divisors(A.transpose()) == D.elementary_divisors()
        )
for A in [
    matrix(ZZ, 16, 16),
    matrix(ZZ, [[1] * 16] * 16),
    (2**90) * identity_matrix(ZZ, 16),
    matrix(ZZ, 19, 16),
    identity_matrix(ZZ, 0),
]:
    assert preconditioned_elementary_divisors(A) == A.elementary_divisors()
import sagejs.linear_algebra.integer_smith as smith_helpers

original_modular_hnf = smith_helpers._modular_hnf


def unavailable_modular_hnf(*args):
    raise NotImplementedError("test a host without modular HNF")


try:
    smith_helpers._modular_hnf = unavailable_modular_hnf
    A = 6 * identity_matrix(ZZ, 16)
    for i in range(16):
        for j in range(i + 1, 16):
            A[i, j] = 6
    assert preconditioned_elementary_divisors(A) == [6] * 16
finally:
    smith_helpers._modular_hnf = original_modular_hnf
# Rectangular coordinate solves use bulk extraction after exact RREF in Wasm.
# Keep multiple right sides, free variables and inconsistent zero rows covered.
for base in [ZZ, QQ]:
    B = matrix(base, [[1, 0, 2], [0, 1, 3]])
    C = matrix(base, [[2, 3, 13], [-1, 4, 10]])
    assert B.solve_left(C) == matrix(QQ, [[2, 3], [-1, 4]])
    A = B.transpose()
    assert A * A.solve_right(C.transpose()) == C.transpose()
    W = matrix(base, [[1, 2, 0], [0, 0, 1]])
    assert W.solve_right(matrix(base, [[3, 4], [5, 6]])) == matrix(
        QQ, [[3, 4], [0, 0], [5, 6]]
    )
    try:
        A.solve_right(vector(base, [0, 0, 1]))
        raise AssertionError("inconsistent coordinate solve accepted")
    except ValueError:
        pass
assert matrix(QQ, 0, 3).solve_right(matrix(QQ, 0, 2)) == matrix(QQ, 3, 2)
assert matrix(QQ, 3, 0).solve_right(matrix(QQ, 3, 2)) == matrix(QQ, 0, 2)
print("integral morphism geometry passed")

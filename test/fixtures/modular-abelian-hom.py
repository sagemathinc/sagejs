"""Shared public Hom/End corpus, in native and packaged browser runtimes."""

from sagejs.modular_abelian_varieties.abelian_variety import _polynomial_at_matrix

R = PolynomialRing(QQ, "t")
f = R([-1, 4, 2, -8, -2, 3, 1])
T = matrix(QQ, [[1, 2], [0, 3]])
assert _polynomial_at_matrix(f, T) == f(T)
assert End(J0(389)).rank() == 32

for level, rank in [
    (1, 0),
    (11, 1),
    (22, 4),
    (23, 2),
    (27, 1),
    (33, 5),
    (37, 2),
    (44, 10),
    (101, 8),
]:
    A = J0(level)
    E = End(A)
    assert E == Hom(A, A) == A.endomorphism_ring()
    assert E.rank() == rank and E.is_full()
    assert E.verify()
    assert E.base_ring() == QQ and E.lattice().base_ring() == ZZ
    assert E.matrix_space() == MatrixSpace(ZZ, 2 * A.dimension(), 2 * A.dimension())
    assert E.lattice().rank() == rank
    assert E.one() == A.identity_morphism()
    assert E(2) == A.multiplication_by(2)
    assert E.zero() == A.zero_morphism()
    for g in E.gens():
        assert g in E and g.verify()
        assert E.from_coordinates(E.coordinates(g)) == g
        assert g.parent() == E
        assert E(g.matrix()) == g
    assert E(A.hecke_morphism(2)) == A.hecke_morphism(2)

E = End(J0(23))
E.coordinates(E.gen())
pivots, inverse = E._coordinate_plan
assert inverse.nrows() == inverse.ncols() == E.rank()
entries = E.gen().matrix().list()
position = next(i for i in range(len(entries)) if i not in pivots)
entries[position] += 1
assert matrix(ZZ, 4, 4, entries) not in E

A, B = J0(11), J0(23)
H = Hom(A, B)
assert H == A.Hom(B) and H.rank() == 0
assert H.zero().verify() and H(0) == A.zero_morphism(B)
assert A.identity_morphism() not in H
assert matrix(ZZ, 2, 4, [1, 0, 0, 0, 0, 0, 0, 0]) not in H

# An arbitrary integral or star-compatible homology operator is not thereby
# a geometric map. End_Q of this elliptic curve is only ZZ, not M_2(ZZ).
assert matrix(ZZ, [[1, 0], [0, 0]]) not in End(A)
for invalid in [matrix(QQ, [[1 / 2, 0], [0, 1 / 2]]), matrix(ZZ, 3, 3)]:
    try:
        End(A)(invalid)
        assert False
    except (TypeError, ValueError, ArithmeticError):
        pass

P = A**2
E = End(P)
assert E.rank() == 4
u = P.injection(0) * P.projection(1)
v = P.injection(1) * P.projection(0)
assert u in E and v in E and u * v != v * u
assert all(f * g in E for f in E.gens() for g in E.gens())
table = E.multiplication_table()
assert all(
    E.from_coordinates(table[i][j]) == E.gen(i) * E.gen(j)
    for i in range(4)
    for j in range(4)
)
assert End(B**2).rank() == 8
assert End(A * B).rank() == 3

diagonal = (P.injection(0) + P.injection(1)).image()
kernel = (P.projection(0) + P.projection(1)).connected_kernel()
assert Hom(diagonal, A).rank() == Hom(A, kernel).rank() == 1
assert Hom(kernel, diagonal).rank() == 1
assert Hom(P, diagonal).rank() == 2
assert all(f.verify() for f in Hom(kernel, diagonal).gens())
assert (P.injection(0) + P.injection(1)) in Hom(A, P)

for scalar in [1, 2, 2**80 + 7]:
    f = A.multiplication_by(scalar)
    g = f.complementary_isogeny()
    assert g.verify() and f * g == A.multiplication_by(scalar)
    assert g * f == A.multiplication_by(scalar)
try:
    P.projection(0).complementary_isogeny()
    assert False
except ValueError:
    pass

# The connected quotient is not silently identified with its embedded model.
Q = AbelianVariety(CuspForms(23).newforms()[0])
S = Q.embedded_subvariety()
assert End(Q).rank() == Hom(Q, S).rank() == Hom(S, Q).rank() == 2
assert Q.quotient_map() in Hom(J0(23), Q)
assert all(f.verify() for f in Hom(Q, S).gens())
distinct = J0(37).decomposition()
assert Hom(distinct[0], distinct[1]).rank() == 0
assert Hom(J0(1), P).rank() == Hom(P, J0(1)).rank() == 0
assert End(A**0).rank() == 0

for item in [
    End(A),
    Hom(A, J0(22)),
    End(P),
    E.one(),
    Hom(A, J0(22)).gen(),
    A.multiplication_by(3).complementary_isogeny(),
]:
    restored = loads(dumps(item))
    assert restored == item and restored.verify()

# A recipe is not allowed to authenticate a different matrix.
bad = End(A).from_coordinates([1])
bad._recipe = ("hom_coordinates", (2,))
assert not bad.verify()
try:
    dumps(bad)
    assert False
except (ValueError, ArithmeticError):
    pass

# A single operator need not separate a joint semisimple Hecke packet.
from sagejs.modular_abelian_varieties import homspace as hs
from sagejs.modular_abelian_varieties.products import block_diagonal

K = matrix(QQ, [[0, 2], [1, 0]])
T = block_diagonal([K, K, K, K])
U = block_diagonal([K, K, -K, -K])
primitive = hs._primitive_algebra_generator([T, U], 8, 4)
assert sorted((f.degree(), e) for f, e in primitive.charpoly().factor()) == [
    (2, 2),
    (2, 2),
]
original = hs._field_basis


def force_fallback(source):
    raise NotImplementedError("exercise complete fallback")


hs._field_basis = force_fallback
try:
    for N, dimensions in [(23, [2]), (37, [1, 1])]:
        source = hs.ModularAbelianVariety(
            N, "modular-symbol subvariety", J0(N).modular_symbols()
        )
        parts = hs._simple_sources(source, 987)
        assert sorted(A.dimension() for A, field in parts) == dimensions
        assert all(len(field) == A.dimension() for A, field in parts)
finally:
    hs._field_basis = original
print("certified Hom and End geometry passed")

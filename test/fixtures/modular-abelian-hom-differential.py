"""The harness injects the pinned Sage `oracle` dictionary."""

import sagejs.modular_abelian_varieties.degeneracy as dg
from sagejs.modular_abelian_varieties.homspace import _flatten
from sagejs.modular_abelian_varieties.lattices import _integer_row_lattice_basis


def rat(value):
    parts = value.split("/")
    return QQ(int(parts[0])) / (QQ(int(parts[1])) if len(parts) > 1 else 1)


bridges = {}
for record in oracle["bridges"]:
    N = record["level"]
    M = ModularSymbols(N, 2)
    P = matrix(QQ, [dg._path(M, g) for g in record["lifts"]])
    change = M._ambient_change_of_basis()
    if change is not None:
        P = P * change.inverse().transpose()
    S = matrix(QQ, [[rat(x) for x in row] for row in record["coordinates"]])
    C = S.solve_right(P)
    L = matrix(QQ, [[rat(x) for x in row] for row in record["integral"]]) * C
    B = J0(N).lattice().basis_matrix()
    U = B.solve_left(L)
    assert abs(U.det()) == 1 and U.change_ring(ZZ) * B == L
    bridges[N] = U
for case in oracle["cases"]:
    A, B = J0(case["domain"]), J0(case["codomain"])
    H = Hom(A, B)
    matrices = [
        bridges[case["domain"]].inverse()
        * matrix(QQ, [[rat(x) for x in row] for row in m])
        * bridges[case["codomain"]]
        for m in case["matrices"]
    ]
    expected = _integer_row_lattice_basis(
        _flatten(matrices, 4 * A.dimension() * B.dimension())
    )
    actual = _integer_row_lattice_basis(H.basis_matrix())
    assert expected == actual, (case["domain"], case["codomain"], expected, actual)
Q = AbelianVariety(CuspForms(23).newforms()[0])
assert End(Q).rank() == 2
assert Hom(Q, Q.embedded_subvariety()).rank() == 2
for a in [J0(11), J0(1), Q, J0(11) ** 2]:
    H = End(a)
    assert H(H.one()) == a.identity_morphism()
    for g in H.gens():
        assert H.from_coordinates(H.coordinates(g)) == g
objects = {"J37": J0(37)}
model_bridges = {"J37": bridges[37]}
for record in oracle["models"]:
    candidates = [AbelianVariety(f) for f in CuspForms(record["level"]).newforms()]
    Q = next(
        A
        for A in candidates
        if [str(c) for c in A.hecke_matrix(2).charpoly().list()] == record["hecke2"]
    )
    A = Q if record["kind"] == "quotient" else Q.embedded_subvariety()
    source = matrix(QQ, [[rat(c) for c in row] for row in record["lattice"]])
    L = source * bridges[37] * J0(37).lattice().basis_matrix()
    U = A.lattice().basis_matrix().solve_left(L)
    assert abs(U.det()) == 1 and U.change_ring(ZZ) * A.lattice().basis_matrix() == L
    objects[record["id"]] = A
    model_bridges[record["id"]] = U
for case in oracle["model_cases"]:
    A, B = objects[case["domain"]], objects[case["codomain"]]
    matrices = [
        model_bridges[case["domain"]].inverse()
        * matrix(QQ, [[rat(c) for c in row] for row in m])
        * model_bridges[case["codomain"]]
        for m in case["matrices"]
    ]
    assert _integer_row_lattice_basis(
        _flatten(matrices, 4 * A.dimension() * B.dimension())
    ) == _integer_row_lattice_basis(Hom(A, B).basis_matrix())
print("connected quotient model lattices passed")

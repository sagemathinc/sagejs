from sage.all import *
import json
import sys

levels = [11, 22, 23, 33, 37, 44, 101]
bridges = []
for N in levels:
    M = ModularSymbols(N, 2)
    symbols = [M.manin_symbols()[i] for i in M.manin_basis()]
    bridges.append(
        {
            "level": N,
            "lifts": [[int(x) for x in s.lift_to_sl2z()] for s in symbols],
            "coordinates": [[str(x) for x in M(s).element()] for s in symbols],
            "integral": [
                [str(x) for x in r]
                for r in M.cuspidal_submodule().integral_structure().basis_matrix()
            ],
        }
    )
cases = []
for N, L in [
    (11, 11),
    (11, 22),
    (22, 11),
    (22, 22),
    (23, 23),
    (33, 33),
    (37, 37),
    (44, 44),
    (11, 23),
    (22, 33),
    (101, 101),
]:
    H = Hom(J0(N), J0(L))
    generators = list(H.gens())
    cases.append(
        {
            "domain": N,
            "codomain": L,
            "rank": len(generators),
            "matrices": [
                [[str(x) for x in row] for row in f.matrix()] for f in generators
            ],
        }
    )
    print(N, L, len(generators), flush=True)
from sage.modular.abvar.abvar import ModularAbelianVariety

models = []
model_cases = []
for index, A in enumerate(J0(37).decomposition()):
    J = J0(37)
    B = A.complement()
    combined = A.lattice().basis_matrix().stack(B.lattice().basis_matrix())
    projected = combined.inverse().matrix_from_columns(range(2 * A.dimension()))
    lattice = (projected * A.lattice().basis_matrix()).row_module(ZZ)
    Q = ModularAbelianVariety((Gamma0(37),), lattice=lattice)
    objects = {"J37": J}
    for kind, variety in [("embedded", A), ("quotient", Q)]:
        key = "37-" + str(index) + "-" + kind
        objects[key] = variety
        models.append(
            {
                "id": key,
                "level": 37,
                "kind": kind,
                "hecke2": [
                    str(c) for c in A.hecke_operator(2).matrix().charpoly().list()
                ],
                "lattice": [
                    [str(c) for c in row] for row in variety.lattice().basis_matrix()
                ],
            }
        )
    a, q = "37-" + str(index) + "-embedded", "37-" + str(index) + "-quotient"
    # The installed Sage's generic overlattice Hom path raises in projection.
    # Use its established End(A), then exact rational transport and Sage's
    # integral saturation, rather than claiming that broken API is an oracle.
    U = A.lattice().basis_matrix().solve_left(Q.lattice().basis_matrix())
    endomorphisms = [f.matrix() for f in Hom(A, A).gens()]
    for left, right, raw_matrices in [
        (a, q, [E * U.inverse() for E in endomorphisms]),
        (q, a, [U * E for E in endomorphisms]),
        (q, q, [U * E * U.inverse() for E in endomorphisms]),
        ("J37", q, [projected * E * U.inverse() for E in endomorphisms]),
    ]:
        raw = matrix(QQ, [M.list() for M in raw_matrices])
        basis = (
            (raw * raw.denominator())
            .change_ring(ZZ)
            .row_module()
            .saturation()
            .basis_matrix()
        )
        generators = [
            matrix(
                ZZ, 2 * objects[left].dimension(), 2 * objects[right].dimension(), row
            )
            for row in basis
        ]
        model_cases.append(
            {
                "domain": left,
                "codomain": right,
                "rank": len(generators),
                "oracle": "Sage End(A), rational lattice transport, integral saturation",
                "matrices": [[[str(c) for c in row] for row in M] for M in generators],
            }
        )
with open(sys.argv[1], "w") as output:
    json.dump(
        {
            "sage_version": version(),
            "bridges": bridges,
            "cases": cases,
            "models": models,
            "model_cases": model_cases,
        },
        output,
        indent=2,
    )
    output.write("\n")

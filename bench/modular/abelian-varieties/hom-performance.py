"""The caller supplies `level` and the parsed Sage `oracle` before timing."""

import json
import time

start = time.perf_counter()
J = J0(level)
H = End(J)
generators = H.gens()
done = time.perf_counter()

# This independent basis bridge and Sage comparison are outside the timing.
import sagejs.modular_abelian_varieties.degeneracy as dg
from sagejs.modular_abelian_varieties.homspace import _flatten
from sagejs.modular_abelian_varieties.lattices import _integer_row_lattice_basis


def rat(value):
    parts = value.split("/")
    return QQ(int(parts[0])) / (QQ(int(parts[1])) if len(parts) > 1 else 1)


M = ModularSymbols(level, 2)
P = matrix(QQ, [dg._path(M, g) for g in oracle["lifts"]])
change = M._ambient_change_of_basis()
if change is not None:
    P = P * change.inverse().transpose()
S = matrix(QQ, [[rat(x) for x in row] for row in oracle["coordinates"]])
C = S.solve_right(P)
L = matrix(QQ, [[rat(x) for x in row] for row in oracle["integral"]]) * C
B = J.lattice().basis_matrix()
U = B.solve_left(L)
assert abs(U.det()) == 1 and U.change_ring(ZZ) * B == L
inverse = U.inverse()
transported = [
    inverse * matrix(QQ, [[rat(x) for x in row] for row in m]) * U
    for m in oracle["matrices"]
]
expected = _integer_row_lattice_basis(_flatten(transported, 4 * J.dimension() ** 2))
assert expected == _integer_row_lattice_basis(H.basis_matrix())
print(
    json.dumps(
        {
            "level": level,
            "dimension": J.dimension(),
            "rank": H.rank(),
            "seconds": done - start,
            "exact_sage_lattice": True,
        }
    )
)

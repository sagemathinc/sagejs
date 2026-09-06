"""Forced, fresh-parent Sage modular abelian variety performance workloads."""

import json
import sys
import time

from sage.all import AbelianVariety, CuspForms, J0
from sage.env import SAGE_VERSION

level = int(sys.argv[1])
workload = sys.argv[2]
warm = J0(11)
warm.modular_symbols().integral_structure().basis_matrix()
warm.integral_homology().hecke_matrix(2)
for factor in warm.decomposition():
    factor.lattice().basis_matrix()


def timed(phase, action):
    started = time.perf_counter()
    result = action()
    print(
        json.dumps({"phase": phase, "seconds": time.perf_counter() - started}),
        flush=True,
    )
    return result


print(
    json.dumps(
        {
            "system": "Sage",
            "version": SAGE_VERSION,
            "level": level,
            "workload": workload,
        }
    ),
    flush=True,
)
J = J0(level)
if workload == "pipeline":
    timed(
        "integral_homology",
        lambda: J.modular_symbols().integral_structure().basis_matrix(),
    )
    T = timed("hecke2", lambda: J.integral_homology().hecke_matrix(2))
    print(
        json.dumps({"hecke2_coefficients": [str(x) for x in T.charpoly().list()]}),
        flush=True,
    )
if workload in ["pipeline", "decomposition"]:
    factors = timed("decomposition", J.decomposition)
    timed("factor_lattices", lambda: [f.lattice().basis_matrix() for f in factors])
    print(
        json.dumps(
            {
                "dimension": int(J.dimension()),
                "factors": sorted(int(f.dimension()) for f in factors),
            }
        ),
        flush=True,
    )
elif workload == "quotient":
    f = timed(
        "select_newform",
        lambda: min(
            CuspForms(level, 2).newforms("a"), key=lambda g: g.base_ring().degree()
        ),
    )

    def quotient():
        Q, q = J.quotient(AbelianVariety(f).complement())
        Q.lattice().basis_matrix()
        q.matrix()
        return Q, q

    Q, q = timed("connected_quotient", quotient)
    print(
        json.dumps(
            {
                "dimension": int(Q.dimension()),
                "map_shape": [int(q.matrix().nrows()), int(q.matrix().ncols())],
                "hecke2_coefficients": [
                    str(x)
                    for x in Q.integral_homology().hecke_matrix(2).charpoly().list()
                ],
            }
        ),
        flush=True,
    )
else:
    raise ValueError("unknown workload")

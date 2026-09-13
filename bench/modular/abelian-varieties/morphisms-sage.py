"""Sage oracle and forced larger-level morphism benchmarks (JSON lines)."""

import json
import sys
import time

from sage.all import J0, ZZ, divisors, matrix as make_matrix
from sage.env import SAGE_VERSION

decomposition = "--decomposition" in sys.argv
levels = [int(n) for n in sys.argv[1:] if n != "--decomposition"]
for level in levels or [11, 33, 37, 43, 101, 389, 1009]:
    start = time.perf_counter()
    J = J0(level)
    if decomposition:
        D = J.decomposition()
        rows = make_matrix([r for A in D for r in A.lattice().basis_matrix().rows()])
        matrix = J.lattice().basis_matrix().solve_left(rows).change_ring(ZZ)
    else:
        T = J.hecke_operator(2) - 1
        matrix = T.matrix().change_ring(ZZ)
    constructed = time.perf_counter()
    invariants = [int(abs(d)) for d in matrix.elementary_divisors() if abs(d) > 1]
    rank = int(matrix.rank())
    done = time.perf_counter()
    for repeat in range(10):
        assert [
            int(abs(d)) for d in matrix.elementary_divisors() if abs(d) > 1
        ] == invariants
        assert matrix.rank() == rank
    warm = time.perf_counter()
    print(
        json.dumps(
            {
                "system": "Sage",
                "version": SAGE_VERSION,
                "workload": "oldform-isogeny" if decomposition else "T2-minus-1",
                "level": level,
                "dimension": int(J.dimension()),
                "rank": rank,
                "invariants": invariants,
                "construction_seconds": constructed - start,
                "smith_seconds": done - constructed,
                "warm_seconds": (warm - done) / 10,
            }
        ),
        flush=True,
    )

if not sys.argv[1:]:
    for level in [22, 33, 44, 121]:
        maps = [J0(11).degeneracy_map(level, int(d)) for d in [1, level // 11]]
        for d, f in zip([1, level // 11], maps, strict=True):
            print(
                json.dumps(
                    {
                        "kind": "degeneracy",
                        "level": level,
                        "index": d,
                        "rank": int(f.matrix().rank()),
                        "invariants": [
                            int(abs(x))
                            for x in f.matrix().change_ring(ZZ).elementary_divisors()
                            if abs(x) > 1
                        ],
                    }
                ),
                flush=True,
            )
    for level in [22, 33, 44, 121]:
        J = J0(level)
        factors = J.decomposition()
        rows = make_matrix(
            [r for A in factors for r in A.lattice().basis_matrix().rows()]
        )
        matrix = J.lattice().basis_matrix().solve_left(rows).change_ring(ZZ)
        print(
            json.dumps(
                {
                    "kind": "decomposition",
                    "level": level,
                    "invariants": [
                        int(abs(d)) for d in matrix.elementary_divisors() if abs(d) > 1
                    ],
                    "labels": sorted(
                        [
                            int(A.newform_level()[0]),
                            int(A.degen_t()[0]),
                            int(A.dimension()),
                        ]
                        for A in factors
                    ),
                }
            ),
            flush=True,
        )
        indices = list(divisors(level // 11))
        cross = []
        for d in indices:
            row = []
            for e in indices:
                f = J.degeneracy_map(11, d) * J0(11).degeneracy_map(level, e)
                assert f.matrix().is_scalar()
                row.append(int(f.matrix()[0, 0]))
            cross.append(row)
        print(
            json.dumps(
                {
                    "kind": "cross-pairing",
                    "level": level,
                    "indices": [int(d) for d in indices],
                    "matrix": cross,
                }
            ),
            flush=True,
        )

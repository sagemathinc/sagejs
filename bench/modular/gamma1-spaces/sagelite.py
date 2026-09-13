r"""Matched SageLite benchmark for full $\Gamma_1(N)$ spaces."""

import json
import math
import sys
import time

sys.path.pop(0)
from sage.all import Gamma1, ModularForms


level = int(sys.argv[1])
weight = int(sys.argv[2]) if len(sys.argv) > 2 else 2
space = ModularForms(Gamma1(level), weight)
precision = space.sturm_bound() + 1
started = time.perf_counter()
basis = space.q_expansion_basis(precision)
basis_ms = 1000 * (time.perf_counter() - started)
print(
    f"SageMath N={level} k={weight}: basis {basis_ms:.1f} ms",
    file=sys.stderr,
    flush=True,
)
cusp = space.cuspidal_subspace()
started = time.perf_counter()
hecke = cusp.hecke_matrix(2)
hecke_ms = 1000 * (time.perf_counter() - started)
print(
    f"SageMath N={level} k={weight}: T2 {hecke_ms:.1f} ms",
    file=sys.stderr,
    flush=True,
)
diamond_index = 2
while math.gcd(level, diamond_index) != 1:
    diamond_index += 1
started = time.perf_counter()
diamond = cusp.diamond_bracket_matrix(diamond_index)
diamond_ms = 1000 * (time.perf_counter() - started)
print(
    f"SageMath N={level} k={weight}: diamond {diamond_ms:.1f} ms",
    file=sys.stderr,
    flush=True,
)
print(
    json.dumps(
        {
            "system": "SageLite",
            "level": level,
            "weight": weight,
            "dimension": int(space.dimension()),
            "cusp_dimension": int(cusp.dimension()),
            "precision": int(precision),
            "hecke_trace": str(hecke.trace()),
            "basis_ms": basis_ms,
            "hecke_ms": hecke_ms,
            "diamond_ms": diamond_ms,
        },
        sort_keys=True,
    )
)

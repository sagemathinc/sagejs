"""SageMath oracle for higher-character q-expansion scaling."""

import json
import sys
import time

# Do not let this file's directory shadow Sage's top-level package.
sys.path.pop(0)
from sage.all import CuspForms, DirichletGroup


cases = {
    "level_101": (101, 5),
    "level_157": (157, 13),
    "level_241": (241, 15),
    "level_401": (401, 25),
}

case = sys.argv[1]
if case not in cases:
    raise ValueError(f"unknown benchmark case: {case}")
level, exponent = cases[case]
character = DirichletGroup(level).gen(0) ** exponent
started = time.perf_counter()
space = CuspForms(character, 3)
dimension = int(space.dimension())
basis = space.q_expansion_basis(dimension + 3)
coefficient = basis[0][dimension + 1]
polynomial = coefficient.minpoly()
milliseconds = 1000 * (time.perf_counter() - started)
print(
    json.dumps(
        {
            "system": "SageMath",
            "id": case,
            "milliseconds": milliseconds,
            "dimension": dimension,
            "order": int(character.order()),
            "field_degree": int(space.base_ring().degree()),
            "fingerprint": str(polynomial(2) / polynomial[polynomial.degree()]),
            "fingerprint_degree": int(polynomial.degree()),
        },
        sort_keys=True,
    )
)

"""Fresh-parent SageMath benchmarks for character modular-form objects."""

import json
import sys
import time

# Do not let this file's directory shadow Sage's top-level package.
sys.path.pop(0)
from sage.all import CuspForms, DirichletGroup


case = sys.argv[1]
started = time.perf_counter()
if case == "quadratic_bad_12":
    character = next(e for e in DirichletGroup(12) if e.conrey_number() == 7)
    space = CuspForms(character, 3)
    operator = space.hecke_matrix(2)
    fingerprint = int(operator.trace())
    degree = int(operator.det())
elif case == "quadratic_new_20":
    character = next(e for e in DirichletGroup(20) if e.conrey_number() == 9)
    space = CuspForms(character, 4).new_subspace()
    operator = space.hecke_matrix(3)
    fingerprint = int(operator.trace())
    degree = int(operator.det())
elif case == "cyclotomic_13":
    character = next(e for e in DirichletGroup(13) if e.conrey_number() == 4)
    space = CuspForms(character, 2)
    operator = space.hecke_matrix(2)
    polynomial = operator.trace().minpoly()
    fingerprint = int(polynomial(2))
    degree = int(polynomial.degree())
else:
    raise ValueError(f"unknown benchmark case: {case}")
milliseconds = 1000 * (time.perf_counter() - started)
print(
    json.dumps(
        {
            "system": "SageMath",
            "id": case,
            "milliseconds": milliseconds,
            "dimension": int(space.dimension()),
            "fingerprint": fingerprint,
            "degree": degree,
        },
        sort_keys=True,
    )
)

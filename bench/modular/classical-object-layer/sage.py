"""Fresh-parent SageMath benchmark for a first cuspidal Hecke matrix."""

import json
import sys
import time

# Do not let this file's name shadow Sage's top-level package.
sys.path.pop(0)
from sage.all import CuspForms


level, weight, index = map(int, sys.argv[1:4])
started = time.perf_counter()
space = CuspForms(level, weight)
operator = space.hecke_matrix(index)
milliseconds = 1000 * (time.perf_counter() - started)
print(
    json.dumps(
        {
            "system": "SageMath",
            "level": level,
            "weight": weight,
            "index": index,
            "milliseconds": milliseconds,
            "dimension": int(space.dimension()),
            "trace": int(operator.trace()),
        },
        sort_keys=True,
    )
)

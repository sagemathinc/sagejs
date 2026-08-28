"""Equal-contract SageMath oracle for Eichler ideal-class Brandt modules."""

import json
import os
import time

from sage.all import BrandtModule


def cases():
    text = os.environ.get("BRANDT_IDEAL_CASES", "11:2:3,37:2:3")
    return [tuple(int(value) for value in item.split(":")) for item in text.split(",")]


records = []
for discriminant, conductor, prime in cases():
    started = time.perf_counter()
    module = BrandtModule(discriminant, conductor)
    ideals = module.right_ideals()
    construction = time.perf_counter() - started
    started = time.perf_counter()
    operator = module.hecke_matrix(prime)
    first_operator = time.perf_counter() - started
    polynomial = operator.charpoly()
    records.append(
        {
            "D": discriminant,
            "N": conductor,
            "ell": prime,
            "dimension": int(module.dimension()),
            "class_count": len(ideals),
            "construction_seconds": construction,
            "first_operator_seconds": first_operator,
            "charpoly_coefficients": [int(value) for value in polynomial.list()],
        }
    )

print(json.dumps({"schema": "sage-brandt-ideal-benchmark-v1", "records": records}))

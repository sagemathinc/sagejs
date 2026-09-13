"""Regenerate the exact SageMath ideal-class matrix-isometry fixture."""

import json

from sage.all import BrandtModule
from sage.env import SAGE_VERSION


CASES = ((11, 1, 3), (11, 2, 3), (37, 2, 3))


records = []
for discriminant, conductor, prime in CASES:
    module = BrandtModule(discriminant, conductor)
    ideals = module.right_ideals()
    operator = module.hecke_matrix(prime)
    records.append(
        {
            "D": discriminant,
            "N": conductor,
            "ell": prime,
            "weights": [int(value) for value in module.monodromy_weights()],
            "theta": [
                [int(value) for value in ideal.theta_series_vector(12)]
                for ideal in ideals
            ],
            "T": [[int(value) for value in row] for row in operator.rows()],
        }
    )

print(
    json.dumps(
        {
            "schema": "sagejs.modular-forms/brandt-ideal-classes-sage-v1",
            "sage_version": SAGE_VERSION,
            "records": records,
        },
        indent=2,
    )
)

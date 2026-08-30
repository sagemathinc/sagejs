"""Resident SageMath benchmark for exact modular-form q-expansion algebra."""

import json
import sys
import time


PRECISION = int(sys.argv[1])
REPEATS = int(sys.argv[2])
SAMPLES = int(sys.argv[3])
MODULUS = 1000000007

D = CuspForms(1, 12).gen(0)
E4 = EisensteinForms(1, 4).gen(0)
PSI = DirichletGroup(5).gen(0) ** 2
V2 = CuspForms(1, 12).degeneracy_map(2, 2)


def timed(operation):
    samples = []
    checksums = []
    for _sample in range(SAMPLES):
        checksum = 0
        started = time.perf_counter()
        for _repeat in range(REPEATS):
            if operation == "product":
                result = (D * E4).q_expansion(PRECISION)
                factor = 1
            elif operation == "V2":
                result = V2(D).q_expansion(2 * PRECISION)
                factor = 2
            elif operation == "twist":
                result = D.twist(PSI).q_expansion(PRECISION)
                factor = 1
            else:
                raise ValueError(operation)
            for offset in range(1, 9):
                coefficient = result[factor * (PRECISION - offset)]
                checksum = (checksum + (offset + 1) * ZZ(coefficient)) % MODULUS
        samples.append((time.perf_counter() - started) / REPEATS)
        checksums.append(int(checksum))
    return {"seconds": samples, "checksums": checksums}


# Warm all three code paths before collecting resident timings.
(D * E4).q_expansion(16)
V2(D).q_expansion(16)
D.twist(PSI).q_expansion(16)

print(
    json.dumps(
        {
            "system": "SageMath",
            "precision": PRECISION,
            "repeats": REPEATS,
            "samples": SAMPLES,
            "operations": {
                operation: timed(operation) for operation in ["product", "V2", "twist"]
            },
        },
        sort_keys=True,
    )
)

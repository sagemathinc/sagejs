"""Matched warm/repeated/batch benchmark for elliptic L-series evaluation.

This is intentionally valid Sage source. Run it under SageMath for the PARI
baseline and under Sage.js after `Lseries_ell.values` is available.
"""

import json
import time


CURVES = [
    ("11a1", [0, -1, 1, -10, -20]),
    ("user-evaluation", [1, 2, 3, 4, 999]),
]
POINTS = [1 + I, 1 - I, 1 + 2 * I, QQ(1) / 2 + I, QQ(3) / 2 - I]
SAMPLES = 7


def median(values):
    values = sorted(values)
    return values[len(values) // 2]


def elapsed(call):
    started = time.perf_counter()
    value = call()
    return time.perf_counter() - started, value


records = []
for curve_id, a_invariants in CURVES:
    curve = EllipticCurve(a_invariants)
    first_seconds, L = elapsed(curve.lseries)
    cold_seconds, cold_value = elapsed(lambda: L(1 + I))
    repeated = [elapsed(lambda: L(1 + I))[0] for _ in range(SAMPLES)]
    independent_L = EllipticCurve(a_invariants).lseries()
    independent = [
        elapsed(lambda point=point: independent_L(point))[0] for point in POINTS
    ]
    batch_seconds = None
    batch_checksum = None
    batch_L = EllipticCurve(a_invariants).lseries()
    if hasattr(batch_L, "values"):
        batch_seconds, batch = elapsed(lambda: batch_L.values(POINTS))
        batch_checksum = str(
            sum((index + 1) * value for index, value in enumerate(batch))
        )
    records.append(
        {
            "curve_id": curve_id,
            "conductor": str(curve.conductor()),
            "lseries_object_seconds": first_seconds,
            "cold_value_seconds": cold_seconds,
            "cold_value": str(cold_value),
            "repeated_median_seconds": median(repeated),
            "independent_batch_total_seconds": sum(independent),
            "native_batch_seconds": batch_seconds,
            "batch_checksum": batch_checksum,
            "samples": int(SAMPLES),
        }
    )

print(json.dumps({"schema": "sagejs.benchmark/elliptic-lseries-v1", "records": records}))

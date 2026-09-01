"""Benchmark the closed resident complex-cubic class-group program.

The clock starts after constructing a fresh field and includes everything from
the defining polynomial through maximal-order construction, relation search,
class-group presentation, and whichever exact proof completes the result: an
unconditional trivial presentation or the rigorous GRH-conditional analytic
index-one proof. The median is the campaign contract; every sample uses a new
field, so no class-number or maximal-order result is cached.
"""

from __future__ import annotations

import json
import time
from typing import Any

from sagejs.number_fields.cubic_class_number_native import (
    certified_complex_cubic_class_group_v1,
)
from sagejs.number_fields.cubic_class_number_native_runtime import (
    certified_complex_cubic_class_number,
)
from sagejs.native import is_compiled


CASES = (
    ("x^3-2*x-2", (-2, -2, 0, 1), 1, ()),
    ("x^3+9*x-55", (-55, 9, 0, 1), 5, (5,)),
    ("x^3-x^2+3*x-4", (-4, 3, -1, 1), 2, (2,)),
)
SAMPLES = 31
TARGET_SECONDS = 0.010
R = PolynomialRing(QQ, "x")
x = R.gen()


def make_field(coefficients: tuple[int, ...], name: str) -> Any:
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    return NumberField(polynomial, name)


def median(values: list[float]) -> float:
    ordered = sorted(values)
    return float(ordered[len(ordered) // 2])


assert is_compiled(certified_complex_cubic_class_group_v1)

# Warm module loading, reusable packed buffers, and native code pages without
# retaining a mathematical object used by the measured samples.
for warm_index, (_label, coefficients, order, invariants) in enumerate(CASES):
    warm = make_field(coefficients, "warm" + str(warm_index))
    assert int(warm.class_number(proof=False)) == order
    warm_receipt = certified_complex_cubic_class_number(warm)
    assert warm_receipt is not None
    assert warm_receipt.class_number == order
    assert warm_receipt.invariants == invariants

records = []
for case_index, (label, coefficients, order, invariants) in enumerate(CASES):
    samples = []
    receipt = None
    for sample_index in range(SAMPLES):
        field = make_field(
            coefficients, "a" + str(case_index) + "_" + str(sample_index)
        )
        started = time.perf_counter_ns()
        answer = int(field.class_number(proof=False))
        elapsed = (time.perf_counter_ns() - started) / 1_000_000_000
        assert answer == order
        samples.append(elapsed)
        receipt = certified_complex_cubic_class_number(field)
        assert receipt is not None and receipt.invariants == invariants
    middle = median(samples)
    assert receipt is not None
    records.append(
        {
            "label": label,
            "coefficients": list(coefficients),
            "class_number": order,
            "invariants": list(invariants),
            "samples_seconds": samples,
            "median_seconds": middle,
            "target_seconds": TARGET_SECONDS,
            "target_met": middle < TARGET_SECONDS,
            "certificate": receipt.to_dict(),
        }
    )

assert all(record["target_met"] for record in records), records
print(
    "CUBIC_NATIVE_CLASS_NUMBER|"
    + json.dumps(
        {
            "schema": "sagejs.number-fields/cubic-native-benchmark-v1",
            "samples_per_field": SAMPLES,
            "records": records,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
)

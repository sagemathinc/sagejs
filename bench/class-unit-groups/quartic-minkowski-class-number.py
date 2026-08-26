"""Measure a bounded exact quartic class-number-one projection.

The baseline deliberately enters the complete class/unit engine, which is the
old scalar degree-four route.  The candidate first tries the complete exact
Minkowski factor base with bounded principal witnesses and falls back to that
same engine when the class-number-one theorem does not close.
"""

from __future__ import annotations

import json
import time
from typing import Any

import sagejs.number_fields.class_unit_groups as class_unit_module
from sagejs.number_fields.class_groups import bounded_minkowski_class_number_one

PRIMARY_SAMPLES = 5
CONTROL_SAMPLES = 3
R = PolynomialRing(QQ, "x")
x = R.gen()
PRINCIPAL_POLYNOMIAL = x**4 + 2
NONTRIVIAL_POLYNOMIAL = x**4 - 3 * x**3 + 4 * x + 4
CASES = (
    ("totally-real-d725", x**4 - x**3 - 3 * x**2 + x + 1, CONTROL_SAMPLES),
    ("mixed-d-283", x**4 - x - 1, CONTROL_SAMPLES),
    ("cyclotomic-8", x**4 + 1, CONTROL_SAMPLES),
    ("totally-complex-x4-plus-2", PRINCIPAL_POLYNOMIAL, PRIMARY_SAMPLES),
)


def median(values: list[float]) -> float:
    return float(sorted(values)[len(values) // 2])


def make_field(polynomial: Any, name: str) -> Any:
    field = NumberField(polynomial, name)
    field.maximal_order()
    return field


def run(
    polynomial: Any,
    expected_class_number: int,
    mode: str,
    proof: bool,
    sample: int,
) -> float:
    field = make_field(
        polynomial,
        mode[0] + str(expected_class_number) + str(int(proof)) + str(sample),
    )
    started = time.perf_counter_ns()
    if mode == "candidate":
        answer = field.class_number(proof=proof)
    else:
        answer = class_unit_module.class_number(field, proof=proof)
    elapsed = (time.perf_counter_ns() - started) / 1_000_000_000
    assert answer == expected_class_number
    if expected_class_number == 1 and mode == "candidate":
        result = field.class_group_result()
        assert result.complete and result.order() == 1
        assert result.certificate.verify(max_elements=1)
    return elapsed


# Warm module, compiler, field-analysis, and isomorphic-field caches before the
# alternating retained samples.
for _warm_label, warm_polynomial, _warm_samples in CASES:
    for warm_proof in (False, True):
        for warm_mode in ("candidate", "baseline"):
            run(warm_polynomial, 1, warm_mode, warm_proof, -1)
bounded_minkowski_class_number_one(make_field(NONTRIVIAL_POLYNOMIAL, "nw"))

rows = []
for label, polynomial, sample_count in CASES:
    for proof in (False, True):
        samples = {"candidate": [], "baseline": []}
        for sample in range(sample_count):
            modes = (
                ("candidate", "baseline")
                if sample % 2 == 0
                else ("baseline", "candidate")
            )
            for mode in modes:
                samples[mode].append(run(polynomial, 1, mode, proof, sample))
        candidate = median(samples["candidate"])
        baseline = median(samples["baseline"])
        ratio = candidate / baseline
        assert candidate <= 0.75
        assert ratio <= 0.50
        rows.append(
            {
                "case": label,
                "proof": proof,
                "samples": sample_count,
                "candidate_samples": samples["candidate"],
                "candidate_median": candidate,
                "baseline_samples": samples["baseline"],
                "baseline_median": baseline,
                "candidate_to_baseline": ratio,
            }
        )

decline_samples = []
for sample in range(PRIMARY_SAMPLES):
    field = make_field(NONTRIVIAL_POLYNOMIAL, "n" + str(sample))
    started = time.perf_counter_ns()
    declined = bounded_minkowski_class_number_one(field)
    decline_samples.append((time.perf_counter_ns() - started) / 1_000_000_000)
    assert not declined.complete and declined.certificate is None
decline_median = median(decline_samples)
assert decline_median <= 0.40

print(
    json.dumps(
        {
            "benchmark": "quartic-minkowski-class-number",
            "nontrivial_decline_samples": decline_samples,
            "nontrivial_decline_median": decline_median,
            "primary_samples": PRIMARY_SAMPLES,
            "control_samples": CONTROL_SAMPLES,
            "rows": rows,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
)

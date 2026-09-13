"""Measure direct factor-base logs in the nontrivial public group adapter."""

from __future__ import annotations

import json
import time
from typing import Any

import sagejs.number_fields.class_group_maps as class_group_maps

R = PolynomialRing(QQ, "x")
x = R.gen()
CASES = (
    ("mixed-h2-d8375", x**4 - 2 * x**3 - x**2 - 3 * x + 1, (2,)),
    ("complex-h4-d36677", x**4 - 4 * x**3 + 4 * x**2 - x + 6, (4,)),
)
SAMPLES = 3


def median(values: list[float]) -> float:
    return float(sorted(values)[len(values) // 2])


def engine_result(polynomial: Any, name: str) -> Any:
    field = NumberField(polynomial, name)
    field.maximal_order()
    result = field.class_unit_group(proof=True, algorithm="minkowski")
    assert result.complete and result.proof_status == "exact-unconditional"
    return result


def adapt(result: Any, mode: str) -> float:
    engine_group = result.class_group()
    direct = engine_group._factor_base_discrete_log
    if mode == "baseline":
        engine_group._factor_base_discrete_log = lambda position, ideal: (
            engine_group.discrete_log(ideal)
        )
    started = time.perf_counter_ns()
    try:
        group = class_group_maps.class_group_from_engine_result(result)
    finally:
        elapsed = (time.perf_counter_ns() - started) / 1_000_000_000
        engine_group._factor_base_discrete_log = direct
    assert group.invariants() in ((2,), (4,))
    assert group.proof_status == "exact-unconditional"
    return elapsed


rows = []
for case_index, (label, polynomial, invariants) in enumerate(CASES):
    warm = engine_result(polynomial, "warm" + str(case_index))
    adapt(warm, "candidate")
    adapt(warm, "baseline")
    candidate_samples = []
    baseline_samples = []
    for sample in range(SAMPLES):
        result = engine_result(polynomial, "a" + str(case_index) + str(sample))
        assert result.class_group().invariants() == invariants
        if sample % 2:
            candidate_samples.append(adapt(result, "candidate"))
            baseline_samples.append(adapt(result, "baseline"))
        else:
            baseline_samples.append(adapt(result, "baseline"))
            candidate_samples.append(adapt(result, "candidate"))
    baseline = median(baseline_samples)
    candidate = median(candidate_samples)
    ratio = candidate / baseline
    assert ratio <= 0.88
    rows.append(
        {
            "label": label,
            "baseline_seconds": baseline,
            "candidate_seconds": candidate,
            "ratio": ratio,
            "baseline_samples": baseline_samples,
            "candidate_samples": candidate_samples,
        }
    )

print(
    "QUARTIC_PUBLIC_FACTOR_BASE_LOG|"
    + json.dumps(
        {
            "schema": "sagejs-benchmark/quartic-public-factor-base-log-v1",
            "samples": SAMPLES,
            "rows": rows,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
)

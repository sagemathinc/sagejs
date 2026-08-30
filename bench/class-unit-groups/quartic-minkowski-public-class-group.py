"""Compare public quartic class groups with the former class/unit adapter."""

from __future__ import annotations

import json
import time
from typing import Any

import sagejs.number_fields.class_unit_groups as class_unit_module

R = PolynomialRing(QQ, "x")
x = R.gen()
CASES = (
    ("mixed-d-283", x**4 - x - 1, 3),
    ("totally-complex-x4-plus-2", x**4 + 2, 5),
)


def median(values: list[float]) -> float:
    return float(sorted(values)[len(values) // 2])


def field(polynomial: Any, name: str) -> Any:
    answer = NumberField(polynomial, name)
    answer.maximal_order()
    return answer


def run(polynomial: Any, proof: bool, mode: str, sample: int) -> float:
    number_field = field(polynomial, mode[0] + str(int(proof)) + str(sample))
    started = time.perf_counter_ns()
    if mode == "candidate":
        group = number_field.class_group(proof=proof)
    else:
        group = class_unit_module.class_group(number_field, proof=proof)
    elapsed = (time.perf_counter_ns() - started) / 1_000_000_000
    assert group.order() == 1 and group.invariants() == () and group.verify()
    return elapsed


# Warm the runtime, isomorphic-field caches, and both public routes before
# retaining alternating samples.
for _label, polynomial, _samples in CASES:
    for proof in (False, True):
        run(polynomial, proof, "candidate", -1)
        run(polynomial, proof, "baseline", -1)

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
                samples[mode].append(run(polynomial, proof, mode, sample))
        candidate = median(samples["candidate"])
        baseline = median(samples["baseline"])
        ratio = candidate / baseline
        assert candidate <= 1.25
        assert ratio <= 0.65
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

print(
    json.dumps(
        {
            "benchmark": "quartic-minkowski-public-class-group",
            "rows": rows,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
)

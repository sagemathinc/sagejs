"""Compare bounded quartic continuation through auto and Minkowski bases."""

from __future__ import annotations

import json
import math
import time
from typing import Any

import sagejs.number_fields.class_unit_groups as class_unit_module
from sagejs.number_fields.class_groups import bounded_minkowski_class_number_one

R = PolynomialRing(QQ, "x")
x = R.gen()
CASES = (
    ("complex-h2-d2889", x**4 - x**3 + 3 * x**2 + 2 * x + 1, 2),
    ("mixed-h2-d8375", x**4 - 2 * x**3 - x**2 - 3 * x + 1, 2),
    ("real-h2-d79937", x**4 - 4 * x**3 - 5 * x**2 + 5 * x + 4, 2),
)
SAMPLES = 3


def median(values: list[float]) -> float:
    return float(sorted(values)[len(values) // 2])


def make_field(polynomial: Any, name: str) -> Any:
    field = NumberField(polynomial, name)
    field.maximal_order()
    return field


def run(polynomial: Any, expected: int, proof: bool, mode: str, sample: int) -> float:
    field = make_field(polynomial, mode[0] + str(int(proof)) + str(sample))
    started = time.perf_counter_ns()
    if mode == "candidate":
        answer = field.class_number(proof=proof)
    else:
        bounded = bounded_minkowski_class_number_one(field)
        assert not bounded.complete and bounded.minkowski_factor_base_complete
        answer = class_unit_module.class_number(field, proof=proof, algorithm="auto")
    elapsed = (time.perf_counter_ns() - started) / 1_000_000_000
    assert answer == expected
    return elapsed


for _label, polynomial, expected in CASES:
    for proof in (False, True):
        run(polynomial, expected, proof, "candidate", -1)
        run(polynomial, expected, proof, "baseline", -1)

rows = []
ratios = []
for label, polynomial, expected in CASES:
    for proof in (False, True):
        candidate_samples = []
        baseline_samples = []
        for sample in range(SAMPLES):
            baseline_samples.append(
                run(polynomial, expected, proof, "baseline", sample)
            )
            candidate_samples.append(
                run(polynomial, expected, proof, "candidate", sample)
            )
        baseline = median(baseline_samples)
        candidate = median(candidate_samples)
        ratio = candidate / baseline
        ratios.append(ratio)
        assert ratio <= 1.02
        rows.append(
            {
                "label": label,
                "proof": proof,
                "baseline_seconds": baseline,
                "candidate_seconds": candidate,
                "ratio": ratio,
                "baseline_samples": baseline_samples,
                "candidate_samples": candidate_samples,
            }
        )

geometric_mean = math.exp(sum(math.log(value) for value in ratios) / len(ratios))
assert geometric_mean <= 0.50

# The class-number-four control did not finish auto relation discovery within
# three minutes during the frozen profile.  Its exact Minkowski continuation
# is bounded here without putting a timeout-dependent baseline in the gate.
hard = make_field(x**4 - 4 * x**3 + 4 * x**2 - x + 6, "hard")
started = time.perf_counter_ns()
assert hard.class_number(proof=True) == 4
hard_seconds = (time.perf_counter_ns() - started) / 1_000_000_000
assert hard_seconds <= 12.0

print(
    "QUARTIC_MINKOWSKI_CONTINUATION|"
    + json.dumps(
        {
            "schema": "sagejs-benchmark/quartic-minkowski-continuation-v1",
            "samples": SAMPLES,
            "rows": rows,
            "geometric_mean_ratio": geometric_mean,
            "class_number_four_candidate_seconds": hard_seconds,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
)

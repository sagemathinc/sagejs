"""Measure reuse of an authenticated empty cubic factor-base decision.

The baseline and candidate both run the exact public cubic scalar preflight.
The baseline then hides its live class-number authority only while entering the
coupled API, recreating the prior redundant bounded class/unit probe.  The
candidate consumes the authenticated empty factor-base size as a routing hint.
Both paths retain the same general relation, regulator, hR, saturation, and
detached proof authorities.
"""

from __future__ import annotations

import json
import time
from typing import Any

import sagejs.number_fields.class_unit_groups as class_unit_module
import sagejs.number_fields.cubic_class_number as cubic_module

SAMPLES = 7
R = PolynomialRing(QQ, "x")
x = R.gen()
POLYNOMIAL = x**3 - x**2 + 1


def median(values: list[float]) -> float:
    return float(sorted(values)[len(values) // 2])


def make_field(name: str) -> Any:
    field = NumberField(POLYNOMIAL, name)
    field.maximal_order()
    return field


def run(mode: str, proof: bool, sample: int) -> tuple[float, Any]:
    field = make_field(mode[0] + str(int(proof)) + str(sample))
    started = time.perf_counter_ns()
    assert class_unit_module.cubic_class_number_projection(field, proof=proof) == 1
    original_reader = cubic_module.authenticated_cubic_class_number
    if mode == "baseline":

        def unavailable_authority(result: Any, source: Any) -> None:
            del result, source
            return None

        cubic_module.authenticated_cubic_class_number = unavailable_authority
    try:
        result = field.class_unit_group(proof=proof)
    finally:
        cubic_module.authenticated_cubic_class_number = original_reader
    elapsed = (time.perf_counter_ns() - started) / 1_000_000_000
    assert result.complete and result.proof_status == "exact-unconditional"
    assert result.class_number() == 1 and result.class_group().invariants() == ()
    assert result.unit_group().unit_rank == 1 and result.unit_group().torsion.order == 2
    assert result.regulator().rigorous and result.regulator().full_rank_certified
    resources = result.diagnostics["resources"]
    assert resources["relation_attempts"] == 1
    assert resources["relation_candidates"] == 2
    assert resources["cubic_specialized_empty_factor_base_skips"] == (
        1 if mode == "candidate" else 0
    )
    return elapsed, result


# Warm module, compiler, and shared analytic caches before alternating samples.
for warm_proof in (False, True):
    for warm_mode in ("candidate", "baseline"):
        run(warm_mode, warm_proof, -1)

rows = []
for proof in (False, True):
    samples = {"candidate": [], "baseline": []}
    last_by_mode = {}
    for sample in range(SAMPLES):
        modes = (
            ("candidate", "baseline")
            if sample % 2 == 0
            else (
                "baseline",
                "candidate",
            )
        )
        for mode in modes:
            elapsed, last_by_mode[mode] = run(mode, proof, sample)
            samples[mode].append(elapsed)
    candidate = median(samples["candidate"])
    baseline = median(samples["baseline"])
    assert candidate <= 0.30
    assert candidate <= baseline * 0.50
    assert len(last_by_mode) == 2
    rows.append(
        {
            "proof": proof,
            "candidate_samples": samples["candidate"],
            "candidate_median": candidate,
            "baseline_samples": samples["baseline"],
            "baseline_median": baseline,
            "candidate_to_baseline": candidate / baseline,
            "candidate_phase_timings": last_by_mode["candidate"].diagnostics[
                "phase_timings"
            ],
            "baseline_phase_timings": last_by_mode["baseline"].diagnostics[
                "phase_timings"
            ],
        }
    )

print(
    json.dumps(
        {
            "benchmark": "cubic-zero-factor-preflight",
            "samples": SAMPLES,
            "rows": rows,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
)
